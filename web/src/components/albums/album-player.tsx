'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import type { AlbumItemView } from '@/contracts/albums';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useAlbumGrant } from './use-album-grant';
import styles from './albums.module.css';

export function AlbumPlayer({ storeId, item }: { storeId: string; item: AlbumItemView }) {
  const access = useAlbumGrant(storeId, item.assetId, 'display');
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const position = useRef(0);
  const [resumePosition, setResumePosition] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  function close(value: boolean) { setOpen(value); if (!value) access.close(); }
  function rememberPosition() { if (video.current) { position.current = video.current.currentTime; setResumePosition(Math.floor(position.current)); } }
  return <>
    <Button ref={opener} variant="secondary" onClick={() => { setOpen(true); void access.open(); }}>
      Abrir {item.mediaType === 'PHOTO' ? 'foto' : 'vídeo'} {item.position}</Button>
    <Dialog open={open} onOpenChange={close} title={`Momento ${item.position}`} description={item.caption || 'Momento privado deste ticket.'} returnFocusRef={opener}>
      {access.busy && <p role="status">Conferindo acesso ao momento…</p>}
      <p role="alert" className={styles.error}>{access.error}</p>
      {access.error && <Button variant="secondary" disabled={access.busy} onClick={() => { void access.open(); }}>Renovar acesso ao momento</Button>}
      {access.grant && <div className={styles.content}>{item.mediaType === 'PHOTO' ?
        <Image unoptimized src={access.grant.url} alt={item.caption || `Foto privada do momento ${item.position}`} width={item.width} height={item.height}
          onError={() => { void access.contentFailure(); }} /> :
        <><video ref={video} controls preload="metadata" playsInline src={access.grant.url} aria-label={`Vídeo privado do momento ${item.position}`}
          onTimeUpdate={rememberPosition} onPause={rememberPosition} onLoadedMetadata={() => {
            if (video.current && position.current > 0) video.current.currentTime = Math.min(position.current, video.current.duration || position.current);
          }} onError={() => { rememberPosition(); void access.contentFailure(); }} />
          {resumePosition > 0 && <p>A posição foi recuperada. Use os controles do vídeo para retomar.</p>}</>}
        <p>Consulta privada e temporária.</p></div>}
    </Dialog>
  </>;
}
