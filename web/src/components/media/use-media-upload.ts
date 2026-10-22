'use client';

import { useEffect, useRef, useState } from 'react';
import type { MediaPage } from '@/contracts/media';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import type { MediaContext, MediaTransport } from './transport';
import { fileError, fromAsset, uploadItem } from './upload';
import type { ItemPatch, UploadItem } from './upload';

export function useMediaUpload(context: MediaContext, transport: MediaTransport) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const rows = useRef<UploadItem[]>([]);
  const active = useRef<{ id: string; controller: AbortController } | null>(null);
  const alive = useRef(true);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: number; page?: MediaPage; error?: string }>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [denied, setDenied] = useState(false);
  const [closedByServer, setClosedByServer] = useState(false);
  const current = result?.key === revision ? result : undefined;
  const page = current?.page;
  const { storeId, collectionId } = context;

  function replace(next: UploadItem[]) { rows.current = next; setItems(next); }
  function update(id: string, patch: ItemPatch) {
    if (alive.current) replace(rows.current.map(item => item.id === id ? { ...item, ...patch } : item));
  }
  function privacyFailure(cause: unknown) {
    if (!(cause instanceof StoreRequestError) || ![401, 403, 404].includes(cause.status)) return false;
    replace([]); setDenied(true); setError('O acesso a estes arquivos não está disponível. Reabra o item autorizado para continuar.');
    return true;
  }
  useEffect(() => {
    const controller = new AbortController();
    transport.list({ storeId, collectionId }, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      const known = new Map(rows.current.map(item => [item.id, item]));
      const remote = value.items.filter(asset => !['REMOVING', 'REMOVED'].includes(asset.state));
      const merged = remote.map(asset => ({ ...fromAsset(asset), ...known.get(asset.id), asset,
        phase: asset.state === 'READY' ? 'done' as const : known.get(asset.id)?.phase ?? fromAsset(asset).phase }));
      const ids = new Set(value.items.map(asset => asset.id));
      replace([...merged, ...rows.current.filter(item => !item.asset && !ids.has(item.id))]);
      setClosedByServer(false);
      setResult({ key: revision, page: value });
    }).catch(cause => {
      if (controller.signal.aborted) return;
      privacyFailure(cause);
      setResult({ key: revision, error: storeError(cause) });
    });
    return () => controller.abort();
    // context is keyed by the parent; callers pass a stable transport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, collectionId, transport, revision]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; active.current?.controller.abort(); };
  }, []);

  function choose(files: File[]) {
    if (!page?.collection.writable || closedByServer || denied || active.current) return;
    if (!files.length) return;
    setError(''); setMessage('');
    if (files.length > 10) { setError('Selecione até 10 arquivos por lote.'); return; }
    const evidence = page.collection.purpose === 'EVIDENCE';
    const maximum = evidence ? 1 : 20;
    const occupied = rows.current.filter(item => !item.invalid && (!evidence || !item.asset || item.asset.revision === page.collection.revision)).length;
    const validCount = files.filter(file => !fileError(file, evidence)).length;
    if (occupied + validCount > maximum) {
      setError(evidence ? 'Esta versão aceita uma foto. Remova o rascunho antes de substituir.' : 'O álbum aceita até 20 itens, incluindo os envios em andamento.');
      return;
    }
    replace([...rows.current, ...files.map(file => {
      const failure = fileError(file, evidence);
      return { id: crypto.randomUUID(), name: file.name, file, attempted: false,
        phase: failure ? 'error' as const : 'selected' as const, error: failure || undefined, invalid: !!failure };
    })]);
    setMessage(`${files.length} ${files.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}. Revise e envie.`);
  }

  async function send(ids: string[]) {
    if (active.current || denied || closedByServer || !page?.collection.writable) return;
    let sent = 0;
    for (const id of ids) {
      const item = rows.current.find(value => value.id === id);
      if (!item?.file || item.invalid) continue;
      const controller = new AbortController();
      active.current = { id, controller }; setBusyId(id); setError(''); setMessage('');
      try {
        const asset = await uploadItem(context, item, transport, controller.signal,
          patch => { if (!controller.signal.aborted) update(id, patch); });
        controller.signal.throwIfAborted();
        update(id, { asset, error: undefined, phase: asset.state === 'READY' ? 'done' : 'waiting' });
        sent += 1;
      } catch (cause) {
        if (!alive.current) return;
        if (controller.signal.aborted) { update(id, { phase: 'error', error: 'Envio pausado. Retome para consultar o progresso confirmado.' }); break; }
        if (privacyFailure(cause)) break;
        if (cause instanceof StoreRequestError && cause.code === 'media_read_only') {
          setClosedByServer(true); update(id, { phase: 'error', error: storeError(cause) }); break;
        }
        if (cause instanceof StoreRequestError && cause.code === 'operation_conflict') {
          update(id, { phase: 'error', error: storeError(cause), file: undefined, input: undefined }); continue;
        }
        update(id, { phase: 'error', error: storeError(cause), invalid: cause instanceof StoreRequestError && [400, 413, 415].includes(cause.status) });
      } finally {
        active.current = null;
        if (alive.current) setBusyId('');
      }
    }
    if (alive.current && sent) setMessage(`${sent} ${sent === 1 ? 'arquivo recebido' : 'arquivos recebidos'} para processamento. Confira o estado de cada item.`);
  }

  async function remove(id: string) {
    if (active.current || denied) return;
    const item = rows.current.find(value => value.id === id);
    if (!item) return;
    if (!item.attempted) { replace(rows.current.filter(value => value.id !== id)); return; }
    const controller = new AbortController();
    active.current = { id, controller }; setBusyId(id);
    try {
      await transport.remove(context, id, controller.signal);
      if (!controller.signal.aborted) { replace(rows.current.filter(value => value.id !== id)); setMessage('Arquivo removido.'); }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (!item.asset && cause instanceof StoreRequestError && cause.status === 404) {
        // Uma resposta perdida não prova que houve persistência. Antes de
        // descartar a seleção ausente, revalidar a autorização da coleção.
        try {
          await transport.list(context, controller.signal);
          if (!controller.signal.aborted) {
            replace(rows.current.filter(value => value.id !== id)); setMessage('Seleção descartada.');
          }
        } catch (currentFailure) {
          if (!controller.signal.aborted && !privacyFailure(currentFailure)) update(id, { phase: 'error', error: storeError(currentFailure) });
        }
      } else if (!privacyFailure(cause)) update(id, { phase: 'error', error: storeError(cause) });
    } finally {
      active.current = null;
      if (alive.current) setBusyId('');
    }
  }
  function resume(id: string, file: File) {
    const item = rows.current.find(value => value.id === id);
    const failure = fileError(file, page?.collection.purpose === 'EVIDENCE');
    if (failure || (item?.asset && (file.size !== item.asset.byteLength || file.type !== item.asset.mimeType))) {
      update(id, { error: failure || 'Escolha o mesmo arquivo, com o tamanho e o formato originais.' }); return;
    }
    update(id, { file, name: file.name, input: undefined, phase: 'selected', error: undefined });
  }
  return { items, page, error, message, busyId, denied, closedByServer, loading: !current, loadError: current?.error,
    choose, send, remove, resume, privacyFailure, refresh: () => { setRevision(value => value + 1); },
    pause: () => active.current?.controller.abort(), revision };
}
