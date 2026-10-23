'use client';

import { MimoMasthead } from '@/components/ui/mimo-page';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import type { MediaAssetView, MediaFileInput } from '@/contracts/media';
import { MediaUploader } from '@/components/media/media-uploader';
import type { MediaTransport } from '@/components/media/transport';
import { StoreRequestError } from '@/components/stores/store-api';
import { Button } from '@/components/ui/button';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
type Entry = { asset: MediaAssetView; input: MediaFileInput; account: string };
type Failure = 'none' | 'reserve' | 'part' | 'limit' | 'delayed';

export function MediaPreview() {
  const [collection, setCollection] = useState(first);
  const [account, setAccount] = useState(first);
  const [mount, setMount] = useState(0);
  const [stats, setStats] = useState({ reservations: 0, parts: 0, offsets: '' });
  const entries = useRef(new Map<string, Entry>());
  const currentAccount = useRef(first);
  const failure = useRef<Failure>('none');
  const closed = useRef(false);
  const denied = useRef(false);
  const shortAccess = useRef(false);
  const parts = useRef<{ assetId: string; offset: number }[]>([]);
  const release = useRef<(() => void) | null>(null);
  const transport = useMemo<MediaTransport>(() => {
    function report() { setStats({ reservations: entries.current.size, parts: parts.current.length,
      offsets: parts.current.map(part => part.offset).join(', ') }); }
    function getEntry(collectionId: string, id: string) {
      const entry = entries.current.get(id);
      if (denied.current || !entry || entry.asset.collectionId !== collectionId || entry.account !== currentAccount.current ||
          entry.asset.state === 'REMOVED') throw new StoreRequestError('resource_unavailable', 404, 'Arquivo indisponível para esta conta.');
      return entry;
    }
    return {
      async list(context) {
        if (denied.current) throw new StoreRequestError('resource_unavailable', 404, 'Coleção indisponível para esta conta.');
        const items = [...entries.current.values()].filter(entry => entry.asset.collectionId === context.collectionId &&
          entry.account === currentAccount.current && entry.asset.state !== 'REMOVED').map(entry => ({ ...entry.asset }));
        return { collection: { id: context.collectionId, storeId: context.storeId,
          purpose: context.collectionId === evidenceId ? 'EVIDENCE' : 'MEMORY', revision: 1, writable: !closed.current },
        items, page: 1, pageSize: 50, total: items.length };
      },
      async reserve(context, inputs) {
        if (failure.current === 'limit') {
          failure.current = 'none'; throw new StoreRequestError('rate_limited', 429, 'Aguarde antes de retomar este arquivo.');
        }
        if (denied.current) throw new StoreRequestError('resource_unavailable', 404, 'Envio indisponível.');
        const items = inputs.map(input => {
          let entry = entries.current.get(input.operationId);
          if (!entry) {
            if (closed.current) throw new StoreRequestError('media_read_only', 409, 'Este envio de mídia está fechado.');
            entry = { account: currentAccount.current, input, asset: { id: input.operationId, collectionId: context.collectionId,
              revision: 1, mediaType: input.mediaType, mimeType: input.mimeType, byteLength: input.byteLength, uploadedBytes: 0,
              state: 'UPLOADING', createdAt: new Date().toISOString(), publishedAt: null, width: null, height: null, durationMs: null, failureCode: null } };
            entries.current.set(input.operationId, entry); report();
          }
          if (entry.account !== currentAccount.current || entry.asset.collectionId !== context.collectionId ||
              entry.input.sha256 !== input.sha256 || entry.input.mimeType !== input.mimeType ||
              entry.input.mediaType !== input.mediaType || entry.input.byteLength !== input.byteLength) {
            throw new StoreRequestError('operation_conflict', 409, 'Escolha o mesmo arquivo da primeira tentativa.');
          }
          return { ...entry.asset };
        });
        if (failure.current === 'reserve') {
          failure.current = 'none'; throw new StoreRequestError('response_lost', 503, 'A resposta da reserva se perdeu. Retome o mesmo arquivo.');
        }
        return { items };
      },
      async get(context, id) { return { ...getEntry(context.collectionId, id).asset }; },
      async part(context, id, offset, bytes) {
        const entry = getEntry(context.collectionId, id);
        if (offset !== entry.asset.uploadedBytes) throw new StoreRequestError('offset_conflict', 409, 'Consulte o progresso antes de continuar.');
        entry.asset.uploadedBytes += bytes.size;
        parts.current.push({ assetId: id, offset }); report();
        if (failure.current === 'part') {
          failure.current = 'none'; throw new StoreRequestError('response_lost', 503, 'Uma parte foi recebida, mas a resposta se perdeu. Retome o arquivo.');
        }
        if (failure.current === 'delayed') {
          failure.current = 'none'; await new Promise<void>(resolve => { release.current = resolve; });
        }
        return { ...entry.asset };
      },
      async complete(context, id) {
        const entry = getEntry(context.collectionId, id); entry.asset.state = 'QUEUED'; return { ...entry.asset };
      },
      async remove(context, id) {
        const entry = getEntry(context.collectionId, id); entry.asset.state = 'REMOVED'; return { ...entry.asset };
      },
      async access(context, id) {
        getEntry(context.collectionId, id);
        return { url: image, expiresAt: new Date(Date.now() + (shortAccess.current ? 100 : 300_000)).toISOString() };
      },
    };
  }, []);
  return <main className="stores-shell">
    <MimoMasthead />
    <Link className="stores-link" href="/visual-check">Voltar à prévia</Link>
    <h1>Mídia de exemplo</h1>
    <p>Demonstração com arquivos fictícios em memória. Não usa API, banco, Storage ou processamento real. Recarregar descarta estes exemplos.</p>
    <p>Contexto: {collection === first ? 'Álbum de Ana' : collection === second ? 'Álbum de Bia' : 'Evidência fictícia'}.
      {' '}Reservas fictícias: {stats.reservations}. Partes fictícias: {stats.parts}. Offsets confirmados: {stats.offsets || 'nenhum'}.</p>
    <div className="stores-actions" role="group" aria-label="Controles da demonstração de mídia">
      <Button variant="secondary" onClick={() => { failure.current = 'reserve'; }}>Perder resposta da reserva</Button>
      <Button variant="secondary" onClick={() => { failure.current = 'part'; }}>Perder resposta de uma parte</Button>
      <Button variant="secondary" onClick={() => { failure.current = 'limit'; }}>Simular limite 429</Button>
      <Button variant="secondary" onClick={() => { failure.current = 'delayed'; }}>Simular demora de uma parte</Button>
      <Button variant="secondary" onClick={() => { release.current?.(); release.current = null; }}>Liberar parte atrasada</Button>
      <Button variant="secondary" onClick={() => setCollection(value => value === first ? second : first)}>Alternar coleção de exemplo</Button>
      <Button variant="secondary" onClick={() => {
        const next = account === first ? second : first; currentAccount.current = next; setAccount(next);
      }}>Trocar conta de exemplo</Button>
      <Button variant="secondary" onClick={() => setMount(value => value + 1)}>Remontar componente de exemplo</Button>
      <Button variant="secondary" onClick={() => {
        for (const entry of entries.current.values()) if (entry.asset.state === 'QUEUED') {
          entry.asset.state = 'READY'; entry.asset.width = 1; entry.asset.height = 1;
        }
      }}>Processar itens fictícios</Button>
      <Button variant="secondary" onClick={() => { closed.current = !closed.current; }}>Alternar somente consulta</Button>
      <Button variant="secondary" onClick={() => { denied.current = true; }}>Negar consulta de exemplo</Button>
      <Button variant="secondary" onClick={() => { shortAccess.current = true; }}>Simular acesso expirado</Button>
      <Button variant="secondary" onClick={() => setCollection(evidenceId)}>Abrir evidência fictícia</Button>
    </div>
    <MediaUploader key={mount} accountKey={account} storeId={first} collectionId={collection} transport={transport} />
  </main>;
}
