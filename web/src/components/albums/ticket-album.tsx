'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlbumPreview, TicketAlbumPage } from '@/contracts/albums';
import type { TicketView } from '@/contracts/redemptions';
import { MediaUploader } from '@/components/media/media-uploader';
import type { MediaSelectionState } from '@/components/media/media-uploader';
import { useRewardAccess, useRewardResource } from '@/components/rewards/access';
import { storeError } from '@/components/stores/store-api';
import { Button } from '@/components/ui/button';
import { AlbumGallery } from './album-gallery';
import { AlbumReview } from './album-review';
import { albumApi, albumBase } from './transport';
import { useAlbumPublication } from './use-album-publication';
import styles from './albums.module.css';

export function TicketAlbum({ ticket, accountKey, onPreviewChange }: {
  ticket: TicketView; accountKey: string; onPreviewChange?: (preview: AlbumPreview) => void;
}) {
  const base = albumBase(ticket.storeId, ticket.id);
  const resource = useRewardResource<TicketAlbumPage>(base);
  if (resource.denied) return null;
  if (resource.loading) return <p role="status">Consultando álbum privado…</p>;
  if (resource.error || !resource.data) return <section className={styles.panel}><h2>Álbum do ticket</h2><p role="alert">{storeError(resource.error)}</p>
    <Button variant="secondary" onClick={resource.reload}>Consultar álbum novamente</Button></section>;
  return <AlbumContent key={`${accountKey}:${ticket.storeId}:${ticket.id}`} initial={resource.data} base={base} accountKey={accountKey} timezone={ticket.timezone} onPreviewChange={onPreviewChange} />;
}
function AlbumContent({ initial, base, accountKey, timezone, onPreviewChange }: {
  initial: TicketAlbumPage; base: string; accountKey: string; timezone: string; onPreviewChange?: (preview: AlbumPreview) => void;
}) {
  const [album, setAlbum] = useState(initial);
  const currentAlbum = useRef(initial);
  const removedAssets = useRef(new Set<string>());
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<MediaSelectionState>({ ready: false, busy: false, selectedCount: 0, assetIds: [], assets: [], unavailable: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const startId = useRef<string | undefined>(undefined);
  const title = useRef<HTMLHeadingElement>(null);
  const unavailable = useRewardAccess();
  const project = useCallback((value: TicketAlbumPage) => {
    currentAlbum.current = value; setAlbum(value);
    onPreviewChange?.({ publishedCount: value.total, thumbnailAssetId: value.items[0]?.assetId ?? null });
  }, [onPreviewChange]);
  const accepted = useCallback((value: TicketAlbumPage) => {
    if (value.version < currentAlbum.current.version) return;
    const hidden = value.items.filter(item => removedAssets.current.has(item.assetId));
    project({ ...value, items: value.items.filter(item => !removedAssets.current.has(item.assetId)), total: Math.max(0, value.total - hidden.length) });
    setRevision(count => count + 1);
  }, [project]);
  const publication = useAlbumPublication(base, accepted, !!album.collectionId);
  const selectionChanged = useCallback((value: MediaSelectionState) => setSelection(value), []);
  useEffect(() => () => active.current?.abort(), []);
  async function refresh(start = false) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      startId.current ??= crypto.randomUUID();
      const current = start ? (await albumApi.start(base, startId.current, controller.signal)).album : await albumApi.read(base, controller.signal);
      if (!controller.signal.aborted) { accepted(current); setRequiresRefresh(false); title.current?.focus(); }
    } catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); } }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  function confirmedRemoval(assetId: string) {
    active.current?.abort(); active.current = null;
    removedAssets.current.add(assetId);
    const value = currentAlbum.current;
    const present = value.items.some(item => item.assetId === assetId);
    project({ ...value, items: value.items.filter(item => item.assetId !== assetId), total: Math.max(0, value.total - Number(present)) });
    setRequiresRefresh(true); setRevision(count => count + 1); title.current?.focus();
    void refresh();
  }
  const pending = busy || publication.busy || publication.stage !== 'idle';
  const locked = pending || requiresRefresh;
  return <section className={styles.panel} aria-label="Álbum privado do ticket">
    <h2 ref={title} tabIndex={-1}>Álbum do ticket</h2><p>Memórias privadas entre o lojista e a pessoa participante deste vale mimo.</p>
    <p role="status" aria-live="polite">{publication.notice}</p><p role="alert" className={styles.error}>{error || publication.error}</p>
    {requiresRefresh && <p role="status">Remoção confirmada. O momento já foi ocultado; atualize o álbum para conferir a versão antes de publicar novamente.</p>}
    {album.unavailableReason === 'CANCELLED' && <p>Ticket cancelado: os momentos existentes continuam para consulta e remoção pelo autor. Novos envios e publicações estão fechados.</p>}
    {album.unavailableReason === 'RETENTION_EXPIRED' && <p>O prazo para adicionar memórias terminou. Pendências podem preservar os momentos anteriores até sua resolução.</p>}
    {album.permissions.canStart && <Button disabled={locked} onClick={() => { void refresh(true); }}>{busy ? 'Preparando álbum…' : 'Adicionar momentos'}</Button>}
    <AlbumGallery album={album} timezone={timezone} removed={confirmedRemoval} />
    {album.collectionId && <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-label="Envio de momentos">
      <MediaUploader key={album.collectionId} refreshKey={revision} accountKey={accountKey} storeId={album.storeId} collectionId={album.collectionId}
        onPrivacyFailure={unavailable} canRemoveOwn localPreviews onSelectionChange={selectionChanged} onRemoved={confirmedRemoval} /></fieldset>}
    {album.permissions.canPublish && <AlbumReview storeId={album.storeId} selection={selection} locked={locked} onPublish={items => { void publication.publish(album, items); }} />}
    {publication.stage === 'uncertain' && <Button variant="secondary" disabled={publication.busy} onClick={() => { void publication.inspect(); }}>Consultar resultado da publicação</Button>}
    {publication.stage === 'review' && <Button variant="secondary" disabled={publication.busy} onClick={() => { void publication.review(); }}>Consultar álbum para nova revisão</Button>}
    <div className={styles.actions}><Button variant="secondary" disabled={pending} onClick={() => { void refresh(); }}>Atualizar álbum</Button></div>
  </section>;
}
