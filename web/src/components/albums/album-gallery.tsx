'use client';

import { useEffect, useRef, useState } from 'react';
import type { AlbumItemView, TicketAlbumPage } from '@/contracts/albums';
import { mediaTransport } from '@/components/media/transport';
import { useRewardAccess } from '@/components/rewards/access';
import { storeError } from '@/components/stores/store-api';
import { localTime } from '@/components/activities/format';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AlbumPlayer } from './album-player';
import { AlbumThumbnail } from './album-preview';
import { durationLabel } from './media-format';
import styles from './albums.module.css';

function AlbumMoment({ album, item, timezone, removed }: {
  album: TicketAlbumPage; item: AlbumItemView; timezone: string; removed: (assetId: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const unavailable = useRewardAccess();
  useEffect(() => () => active.current?.abort(), []);
  async function remove() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      await mediaTransport.remove({ storeId: album.storeId, collectionId: album.collectionId ?? '' }, item.assetId, controller.signal);
      if (!controller.signal.aborted) { setConfirm(false); removed(item.assetId); }
    } catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); } }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  return <li className={styles.item} aria-label={`Momento publicado ${item.position}`}>
    <h4>Momento {item.position} · {item.mediaType === 'PHOTO' ? 'Foto' : 'Vídeo'}</h4>
    <p>{item.width} × {item.height} px{item.mediaType === 'VIDEO' && item.durationMs !== null ? ` · ${durationLabel(item.durationMs)}` : ''}</p>
    <p>Publicado em <time dateTime={item.publishedAt}>{localTime(item.publishedAt, timezone)}</time> · {timezone}</p>
    <AlbumThumbnail storeId={album.storeId} assetId={item.assetId} />
    {item.caption && <p className={styles.text}>{item.caption}</p>}
    <div className={styles.actions}><AlbumPlayer storeId={album.storeId} item={item} />
      {item.canRemove && <Button ref={opener} variant="secondary" onClick={() => setConfirm(true)}>Remover momento {item.position}</Button>}</div>
    <Dialog open={confirm} onOpenChange={value => { if (!busy) setConfirm(value); }} title={`Remover momento ${item.position}?`}
      description="Este momento deixará de aparecer no álbum. O ticket e a publicação original continuam no histórico." returnFocusRef={opener}>
      <p role="alert">{error}</p><div className={styles.actions}><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>Manter momento</Button>
        <Button disabled={busy} onClick={() => { void remove(); }}>{busy ? 'Removendo…' : 'Confirmar remoção do momento'}</Button></div>
    </Dialog>
  </li>;
}
export function AlbumGallery({ album, timezone, removed }: {
  album: TicketAlbumPage; timezone: string; removed: (assetId: string) => void;
}) {
  return <section aria-label="Momentos publicados"><h3>Momentos publicados</h3>
    {!album.items.length && <p>Ainda não há momentos publicados neste álbum.</p>}
    <ol className={styles.items}>{album.items.map(item => <AlbumMoment key={item.assetId} album={album} item={item} timezone={timezone} removed={removed} />)}</ol>
  </section>;
}
