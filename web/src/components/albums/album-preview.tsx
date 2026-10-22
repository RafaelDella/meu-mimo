'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import type { AlbumPreview } from '@/contracts/albums';
import { Button } from '@/components/ui/button';
import { useAlbumGrant } from './use-album-grant';
import styles from './albums.module.css';

export function AlbumThumbnail({ storeId, assetId, eager = false }: { storeId: string; assetId: string; eager?: boolean }) {
  const access = useAlbumGrant(storeId, assetId, 'thumbnail');
  const target = useRef<HTMLDivElement>(null);
  const open = access.open;
  useEffect(() => {
    if (eager) { void open(); return; }
    const node = target.current; if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void open(); }
    });
    observer.observe(node); return () => observer.disconnect();
  }, [open, eager]);
  return <div ref={target}>
    {access.grant && <Image unoptimized className={styles.thumb} src={access.grant.url} width={240} height={160} alt="Prévia privada do álbum"
      onError={() => { void access.contentFailure(); }} />}
    {access.error && <><p role="alert">{access.error}</p><Button variant="secondary" disabled={access.busy} onClick={() => { void access.open(); }}>Renovar miniatura</Button></>}
  </div>;
}
export function TicketAlbumPreview({ storeId, preview }: { storeId: string; preview: AlbumPreview }) {
  if (!preview.publishedCount) return null;
  return <div><p>{preview.publishedCount} {preview.publishedCount === 1 ? 'momento no álbum' : 'momentos no álbum'}</p>
    {preview.thumbnailAssetId && <AlbumThumbnail key={preview.thumbnailAssetId} storeId={storeId} assetId={preview.thumbnailAssetId} />}</div>;
}
