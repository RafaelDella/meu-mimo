'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { MediaAssetView } from '@/contracts/media';
import { Button } from '@/components/ui/button';
import type { MediaContext, MediaTransport } from './transport';
import { mediaTransport } from './transport';
import { MediaItem } from './media-item';
import { useMediaUpload } from './use-media-upload';
import styles from './media.module.css';

export type MediaSelectionState = {
  ready: boolean; busy: boolean; selectedCount: number; assetIds: string[]; assets?: MediaAssetView[]; unavailable: boolean;
};
type Props = MediaContext & {
  accountKey: string; transport?: MediaTransport; onSelectionChange?: (state: MediaSelectionState) => void;
  onPrivacyFailure?: (cause: unknown) => void; canRemoveOwn?: boolean;
  onRemoved?: (assetId: string) => void;
  localPreviews?: boolean;
  refreshKey?: number;
};

// Sessão e origem são responsabilidade do chamador. A chave descarta arquivos,
// requisições e URLs imediatamente ao trocar conta, loja ou coleção.
export function MediaUploader({ accountKey, storeId, collectionId, transport = mediaTransport, onSelectionChange, onPrivacyFailure, canRemoveOwn, onRemoved, localPreviews = false, refreshKey = 0 }: Props) {
  return <MediaUploadContent key={`${accountKey}:${storeId}:${collectionId}`} context={{ storeId, collectionId }}
    transport={transport} onSelectionChange={onSelectionChange} onPrivacyFailure={onPrivacyFailure} canRemoveOwn={canRemoveOwn} onRemoved={onRemoved} localPreviews={localPreviews} refreshKey={refreshKey} />;
}

function MediaUploadContent({ context, transport, onSelectionChange, onPrivacyFailure, canRemoveOwn, onRemoved, localPreviews, refreshKey }: {
  context: MediaContext; transport: MediaTransport; onSelectionChange?: Props['onSelectionChange'];
  onPrivacyFailure?: Props['onPrivacyFailure']; canRemoveOwn?: boolean;
  onRemoved?: Props['onRemoved'];
  localPreviews: boolean;
  refreshKey: number;
}) {
  const id = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [cameraHelp, setCameraHelp] = useState(false);
  const focusAfterLoad = useRef(false);
  const upload = useMediaUpload(context, transport, onPrivacyFailure, onRemoved, refreshKey);
  const evidence = upload.page?.collection.purpose === 'EVIDENCE';
  const writable = !!upload.page?.collection.writable && !upload.denied && !upload.closedByServer;
  const selection = upload.items.filter(item => item.file && !item.invalid && ['selected', 'error'].includes(item.phase)).map(item => item.id);
  useEffect(() => {
    const unavailable = !upload.page || upload.loading || !!upload.loadError || upload.denied;
    const current = upload.items.filter(item => upload.page?.collection.purpose !== 'EVIDENCE' ||
      !item.asset || item.asset.revision === upload.page.collection.revision);
    onSelectionChange?.({ ready: !unavailable && current.every(item => !item.invalid && item.asset?.state === 'READY'),
      busy: !!upload.busyId, selectedCount: current.length, assetIds: current.map(item => item.id),
      assets: current.flatMap(item => item.asset ? [item.asset] : []), unavailable });
  }, [upload.items, upload.page, upload.loading, upload.loadError, upload.denied, upload.busyId, onSelectionChange]);
  useEffect(() => {
    if (!upload.loading && focusAfterLoad.current) { focusAfterLoad.current = false; title.current?.focus(); }
  }, [upload.loading]);
  function refresh() { focusAfterLoad.current = true; upload.refresh(); }
  async function send(ids: string[]) { await upload.send(ids); title.current?.focus(); }
  async function remove(assetId: string) { await upload.remove(assetId); title.current?.focus(); }

  return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} ref={title} tabIndex={-1}>Arquivos deste item</h2>
    <p>Rascunhos ficam visíveis somente para quem envia. A publicação para a outra pessoa depende da confirmação do item de origem.</p>
    <p role="status" aria-live="polite" aria-atomic="true">{upload.message}</p>
    <p role="alert" className={styles.error}>{upload.error}</p>
    {upload.loading && <p role="status">Conferindo os arquivos autorizados…</p>}
    {upload.loadError && !upload.denied && <div role="alert"><p>{upload.loadError}</p>
      <Button variant="secondary" onClick={refresh}>Tentar carregar novamente</Button></div>}
    {upload.page && !upload.denied && <>
      <p id={`${id}-hint`}>{evidence ? 'Uma foto por versão de evidência, até 10 MB. JPEG, PNG ou WebP.' :
        'Álbum com até 20 itens. Até 10 arquivos por lote. Fotos JPEG, PNG ou WebP até 10 MB; vídeos MP4 ou MOV até 100 MB e 60 segundos.'}</p>
      {writable ? <div className={styles.selection}>
        <input ref={gallery} className={styles.hidden} tabIndex={-1} type="file" aria-hidden="true" aria-label="Escolher arquivos da galeria"
          accept={evidence ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime'}
          multiple={!evidence} disabled={!!upload.busyId} onChange={event => {
            upload.choose([...event.target.files ?? []]); event.target.value = '';
          }} />
        <input ref={camera} className={styles.hidden} tabIndex={-1} type="file" accept="image/jpeg,image/png,image/webp"
          capture="environment" aria-hidden="true" aria-label="Selecionar foto da câmera" disabled={!!upload.busyId} onChange={event => {
            upload.choose([...event.target.files ?? []]); event.target.value = '';
          }} />
        <div className={styles.actions}>
          <Button variant="secondary" disabled={!!upload.busyId} aria-describedby={`${id}-hint`} onClick={() => gallery.current?.click()}>Escolher da galeria</Button>
          <Button variant="secondary" disabled={!!upload.busyId} onClick={() => { setCameraHelp(true); camera.current?.click(); }}>Usar câmera</Button>
        </div>
        {cameraHelp && <p role="status">Se a câmera não abrir, for cancelada ou não tiver permissão, escolha uma foto da galeria. Não é preciso liberar a câmera para continuar.</p>}
        {selection.length > 0 && <Button disabled={!!upload.busyId} onClick={() => { void send(selection); }}>Enviar arquivos selecionados</Button>}
      </div> : <p>Este item está somente para consulta. Os arquivos anteriores continuam no histórico.</p>}
      {!upload.items.length && <p>Ainda não há arquivos neste item.</p>}
      <ol className={styles.items} aria-label="Arquivos selecionados e enviados">{upload.items.map(item =>
        <MediaItem key={`${item.id}:${upload.revision}`} item={item} context={context} transport={transport}
          busy={!!upload.busyId} current={upload.busyId === item.id} writable={writable && (!item.asset || item.asset.revision === upload.page!.collection.revision)}
          removable={canRemoveOwn === undefined ? undefined : canRemoveOwn && !upload.denied}
          localPreview={localPreviews && !evidence}
          retry={() => { void send([item.id]); }} remove={() => { void remove(item.id); }} pause={upload.pause}
          resume={file => upload.resume(item.id, file)} denied={upload.privacyFailure} />)}</ol>
      <Button variant="secondary" disabled={!!upload.busyId} onClick={refresh}>Atualizar arquivos</Button>
      {upload.hasMore && <Button variant="secondary" disabled={!!upload.busyId} onClick={() => {
        focusAfterLoad.current = true; upload.loadMore();
      }}>Carregar arquivos anteriores</Button>}
    </>}
  </section>;
}
