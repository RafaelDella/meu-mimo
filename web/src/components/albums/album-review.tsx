'use client';

import { useId, useRef, useState } from 'react';
import type { AlbumPublicationBody } from '@/contracts/albums';
import type { MediaSelectionState } from '@/components/media/media-uploader';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AlbumThumbnail } from './album-preview';
import { durationLabel } from './media-format';
import styles from './albums.module.css';

export function AlbumReview({ storeId, selection, locked, onPublish }: {
  storeId: string; selection: MediaSelectionState; locked: boolean; onPublish: (items: AlbumPublicationBody['items']) => void;
}) {
  const id = useId();
  const [order, setOrder] = useState<string[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [reviewed, setReviewed] = useState<AlbumPublicationBody['items']>([]);
  const opener = useRef<HTMLButtonElement>(null);
  const fields = useRef(new Map<string, HTMLTextAreaElement>());
  const assets = (selection.assets ?? []).filter(asset => asset.state === 'READY' && !asset.publishedAt);
  const known = new Set(assets.map(asset => asset.id));
  const ids = [...order.filter(value => known.has(value)), ...assets.map(asset => asset.id).filter(value => !order.includes(value))];
  const chosen = ids.filter(value => selected.includes(value));
  const waiting = Math.max(0, selection.selectedCount - (selection.assets ?? []).filter(asset => asset.publishedAt).length - chosen.length);
  function move(assetId: string, direction: number) {
    const next = [...ids]; const index = next.indexOf(assetId); const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; setOrder(next);
  }
  function review() {
    const next: Record<string, string> = {};
    for (const assetId of chosen) {
      const text = (captions[assetId] ?? '').trim();
      if (Array.from(text).length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) next[assetId] = 'Use até 500 caracteres Unicode válidos na legenda.';
    }
    setErrors(next);
    const invalid = Object.keys(next)[0]; if (invalid) { fields.current.get(invalid)?.focus(); return; }
    setReviewed(chosen.map(assetId => ({ assetId, caption: (captions[assetId] ?? '').trim() }))); setConfirm(true);
  }
  return <section aria-label="Revisão da publicação"><h3>Revisar momentos prontos</h3>
    <p>Selecione explicitamente de 1 a 10 momentos prontos. Legenda e ordem ficam imutáveis após publicar; novos lotes entram no fim do álbum.</p>
    <p>As legendas e a ordem ainda não publicadas ficam nesta tela. Depois de recarregar, revise esses campos novamente.</p>
    <p>{selection.selectedCount} itens ocupam o álbum, incluindo publicados, falhas e envios em andamento.</p>
    {!ids.length && <p>Nenhum rascunho pronto para publicar. Envie os arquivos e atualize após o processamento.</p>}
    <ol className={styles.items} aria-label="Ordem dos rascunhos prontos">{ids.map((assetId, index) => {
      const asset = assets.find(value => value.id === assetId)!;
      return <li key={assetId} className={styles.item} aria-label={`Rascunho pronto ${index + 1}`}>
        <h4>{asset.mediaType === 'PHOTO' ? 'Foto' : 'Vídeo'} · rascunho {index + 1}</h4>
        <AlbumThumbnail storeId={storeId} assetId={assetId} eager />
        {asset.mediaType === 'VIDEO' && asset.durationMs !== null && <p>{durationLabel(asset.durationMs)}</p>}
        <label className={styles.choice}><input type="checkbox" disabled={locked || selection.busy || (!selected.includes(assetId) && chosen.length >= 10)} checked={selected.includes(assetId)}
          onChange={event => setSelected(current => event.target.checked ? [...current, assetId] : current.filter(value => value !== assetId))} />Selecionar momento {index + 1} para publicar</label>
        <div className={styles.field}><label htmlFor={`${id}-${assetId}`}>Legenda do momento {index + 1}</label>
          <textarea id={`${id}-${assetId}`} ref={node => { if (node) fields.current.set(assetId, node); else fields.current.delete(assetId); }} value={captions[assetId] ?? ''}
            disabled={locked || selection.busy} aria-invalid={errors[assetId] ? true : undefined} aria-describedby={`${id}-${assetId}-hint ${id}-${assetId}-error`}
            onChange={event => { setCaptions(current => ({ ...current, [assetId]: event.target.value })); setErrors(current => ({ ...current, [assetId]: '' })); }} />
        </div><p id={`${id}-${assetId}-hint`}>{Array.from(captions[assetId] ?? '').length} de 500 caracteres Unicode. Opcional.</p>
        <p id={`${id}-${assetId}-error`} role="alert">{errors[assetId]}</p>
        <div className={styles.actions}><Button variant="secondary" disabled={locked || index === 0} onClick={() => move(assetId, -1)}>Mover momento {index + 1} antes</Button>
          <Button variant="secondary" disabled={locked || index === ids.length - 1} onClick={() => move(assetId, 1)}>Mover momento {index + 1} depois</Button></div>
      </li>;
    })}</ol>
    <Button ref={opener} disabled={locked || selection.busy || selection.unavailable || !chosen.length} onClick={review}>Publicar {chosen.length} momentos prontos</Button>
    <Dialog open={confirm} onOpenChange={setConfirm} title="Confirmar publicação dos momentos?" returnFocusRef={opener}>
      <p>{reviewed.length} momentos serão publicados na ordem revisada. {waiting} {waiting === 1 ? 'item ficará' : 'itens ficarão'} no rascunho, sem publicação automática.</p>
      <p>A pessoa participante verá apenas os momentos confirmados. A publicação gera um aviso agrupado.</p>
      <div className={styles.actions}><Button variant="secondary" onClick={() => setConfirm(false)}>Voltar à revisão</Button>
        <Button disabled={locked} onClick={() => { setConfirm(false); onPublish(reviewed); }}>Confirmar publicação</Button></div>
    </Dialog>
  </section>;
}
