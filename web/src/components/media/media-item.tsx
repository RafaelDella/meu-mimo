'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import type { MediaAccess } from '@/contracts/media';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { MediaContext, MediaTransport } from './transport';
import type { UploadItem } from './upload';
import styles from './media.module.css';

type Props = {
  item: UploadItem; context: MediaContext; transport: MediaTransport; busy: boolean; current: boolean;
  writable: boolean; retry: () => void; remove: () => void; pause: () => void; resume: (file: File) => void;
  removable?: boolean;
  localPreview?: boolean;
  denied: (cause: unknown) => boolean;
};
function itemStatus(item: UploadItem) {
  if (item.phase === 'hashing') return 'Conferindo o arquivo…';
  if (item.phase === 'sending') return 'Enviando partes do arquivo…';
  if (item.error) return 'O envio precisa de atenção.';
  const state = item.asset?.state;
  if (state === 'READY') return 'Pronto para consulta privada.';
  if (state === 'QUEUED' || state === 'PROCESSING') return 'Recebido. Preparando a mídia para consulta.';
  if (state === 'FAILED') return item.asset?.failureCode === 'file_invalid' ?
    'Este arquivo não pôde ser processado. Remova-o e escolha outro compatível.' : 'O processamento falhou. Você pode tentar novamente.';
  return item.file ? 'Selecionado. Ainda não foi enviado.' : 'Envio interrompido. Selecione o arquivo original para retomar.';
}

export function MediaItem({ item, context, transport, busy, current, writable, removable = writable, localPreview = false, retry, remove, pause, resume, denied }: Props) {
  const inputId = useId();
  const controller = useRef<AbortController | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const discard = useRef<HTMLButtonElement>(null);
  const [grant, setGrant] = useState<MediaAccess>();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const previewNode = useRef<HTMLImageElement>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!localPreview || !item.file || item.asset || item.invalid) return;
    const url = URL.createObjectURL(item.file);
    if (previewNode.current) previewNode.current.src = url;
    if (previewVideo.current) previewVideo.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [localPreview, item.file, item.asset, item.invalid]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!grant) return;
    const timeout = setTimeout(() => {
      setGrant(undefined); setError('O acesso temporário expirou. Abra o arquivo novamente.');
    }, Math.max(0, Date.parse(grant.expiresAt) - Date.now()));
    return () => clearTimeout(timeout);
  }, [grant]);

  async function open() {
    if (controller.current) return;
    const active = new AbortController(); controller.current = active;
    setOpening(true); setError(''); setGrant(undefined);
    try {
      const value = await transport.access(context, item.id, 'display', active.signal);
      if (!active.signal.aborted) setGrant(value);
    } catch (cause) {
      if (!active.signal.aborted && !denied(cause)) setError(storeError(cause));
    } finally {
      if (!active.signal.aborted) { controller.current = null; setOpening(false); }
    }
  }
  async function contentFailure() {
    if (!grant || controller.current) return;
    const active = new AbortController(); controller.current = active;
    const url = grant.url; setGrant(undefined);
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: active.signal, headers: { Range: 'bytes=0-0' } });
      await response.body?.cancel();
      if (!response.ok) throw new StoreRequestError('media_unavailable', response.status,
        response.status === 410 ? 'O acesso temporário expirou. Abra o arquivo novamente.' : 'Não foi possível abrir o arquivo. Confira seu acesso e tente novamente.');
      if (!active.signal.aborted) setError('Não foi possível reproduzir este arquivo. Abra-o novamente para renovar o acesso.');
    } catch (cause) { if (!active.signal.aborted && !denied(cause)) setError(storeError(cause)); }
    finally { if (!active.signal.aborted) controller.current = null; }
  }
  const available = item.asset?.state === 'READY';
  const canResume = !item.invalid && (!item.asset || (['UPLOADING', 'FAILED'].includes(item.asset.state) && item.asset.failureCode !== 'file_invalid'));
  const bytes = item.asset?.uploadedBytes ?? 0;
  const total = item.asset?.byteLength ?? item.file?.size ?? 0;
  const percent = total ? Math.floor(bytes / total * 100) : 0;
  return <li className={styles.item} aria-label={item.name}>
    <h3>{item.name}</h3>
    {localPreview && item.file && !item.asset && !item.invalid && <div className={styles.content}>{item.file.type.startsWith('image/') ?
      // O endereço existe somente no efeito e é revogado ao descartar o arquivo.
      // eslint-disable-next-line @next/next/no-img-element
      <img ref={previewNode} alt={`Prévia local de ${item.name}`} width={240} height={160} /> :
      <video ref={previewVideo} controls preload="metadata" playsInline aria-label={`Prévia local de ${item.name}`} />}</div>}
    {item.asset && <p>Versão {item.asset.revision} · {item.asset.mediaType === 'PHOTO' ? 'Foto' : 'Vídeo'}</p>}
    <p role="status" aria-live="polite">{itemStatus(item)}</p>
    {!item.invalid && <><progress max={100} value={percent} aria-label={`Progresso de ${item.name}`} />
      <p className={styles.detail}>{percent}% confirmado · {(bytes / 1_000_000).toFixed(2)} de {(total / 1_000_000).toFixed(2)} MB</p></>}
    {item.error && <p role="alert" className={styles.error}>{item.error}</p>}
    {writable && canResume && !item.file && <label className={styles.fileLabel} htmlFor={inputId}>Arquivo original para retomar
      <input id={inputId} type="file" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; if (file) resume(file); event.target.value = '';
      }} /></label>}
    <div className={styles.actions}>
      {current ? <Button variant="secondary" onClick={pause}>Pausar envio</Button> :
        writable && canResume && item.file && <Button disabled={busy} onClick={retry}>
          {item.attempted ? 'Retomar arquivo' : 'Enviar arquivo'}</Button>}
      {removable && <Button ref={discard} variant="secondary" disabled={busy} onClick={() => {
        if (item.attempted || item.asset) setConfirmDiscard(true); else remove();
      }}>Remover arquivo</Button>}
      {available && <Button ref={opener} variant="secondary" disabled={opening} onClick={() => { void open(); }}>
        {opening ? 'Conferindo acesso…' : 'Abrir arquivo'}</Button>}
      {grant && <Button variant="secondary" onClick={() => { setGrant(undefined); opener.current?.focus(); }}>Fechar arquivo</Button>}
    </div>
    <p role="alert" className={styles.error}>{error}</p>
    <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard} title="Descartar arquivo?"
      description={`Você vai descartar “${item.name}”. O arquivo ficará indisponível e precisará ser enviado novamente se mudar de ideia.`}
      returnFocusRef={discard}>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>Manter arquivo</Button>
        <Button onClick={() => { setConfirmDiscard(false); setGrant(undefined); remove(); }}>Confirmar remoção</Button>
      </div>
    </Dialog>
    {grant && item.asset && <div className={styles.content}>
      {item.asset.mediaType === 'PHOTO' ? <Image src={grant.url} unoptimized alt="Foto privada deste item"
        width={item.asset.width ?? 480} height={item.asset.height ?? 480}
        onError={() => { void contentFailure(); }} /> :
        <video controls preload="metadata" playsInline src={grant.url} aria-label="Vídeo privado deste item"
          onError={() => { void contentFailure(); }} />}
      <p>Consulta privada e temporária. Feche o arquivo ao terminar.</p>
    </div>}
  </li>;
}
