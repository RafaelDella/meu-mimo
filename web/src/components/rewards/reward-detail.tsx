'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { RewardView } from '@/contracts/rewards';
import type { StoreView } from '@/contracts/stores';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useRewardAccess, useRewardResource } from './access';
import { RewardAvailabilityText, RewardRule, RewardIllustration } from './reward-display';
import { RedeemControl, RewardRecovery } from './redeem-control';
import { apiBase, rewardApi, rewardPath } from './transport';
import styles from './rewards.module.css';

function Detail({ store, initial, operationId }: { store: StoreView; initial: RewardView; operationId?: string }) {
  const [reward, setReward] = useState(initial);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const archiveTrigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (reward.archivedAt) title.current?.focus(); }, [reward.archivedAt]);
  const active = useRef<AbortController | null>(null);
  const pending = useRef<{ operationId: string; expectedVersion: number; expectedStockRevision: number } | null>(null);
  const unavailable = useRewardAccess();
  const merchant = store.role === 'MERCHANT';
  useEffect(() => () => active.current?.abort(), []);
  async function archive() {
    if (active.current || conflict) return;
    pending.current ??= { operationId: crypto.randomUUID(), expectedVersion: reward.version, expectedStockRevision: reward.stockRevision };
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const result = await rewardApi.archive(store.id, reward.id, pending.current, controller.signal);
      if (!controller.signal.aborted) { setReward(result.reward); setArchiveOpen(false); setUncertain(false); pending.current = null; }
    } catch (cause) {
      if (controller.signal.aborted) return;
      unavailable(cause); setError(storeError(cause));
      if (cause instanceof StoreRequestError && cause.status === 409) { setConflict(true); setUncertain(false); pending.current = null; }
      else setUncertain(true);
    } finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  async function refresh() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true);
    try { const value = await rewardApi.read(store.id, reward.id, controller.signal);
      if (!controller.signal.aborted) { setReward(value); setConflict(false); setArchiveOpen(false); setError(''); } }
    catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); } }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  return <section className="stores-card"><Link className="stores-link" href={rewardPath(store.id)}>Voltar aos mimos</Link>
    <RewardIllustration sticker={reward.sticker} /><h2 ref={title} tabIndex={-1}>{reward.name}</h2>
    <p>{reward.category}</p><p className={styles.text}>{reward.description}</p><RewardRule reward={reward} />
    {reward.archivedAt && <p>Este mimo foi arquivado. Os tickets já emitidos preservam o conteúdo da ocasião.</p>}
    {reward.note && <><h3>Um recadinho</h3><p className={styles.text}>{reward.note}</p></>}
    {reward.instructions && <><h3>Para combinar</h3><p className={styles.text}>{reward.instructions}</p></>}
    {merchant ? <><p>Versão do cadastro: {reward.version}. Revisão do estoque: {reward.stockRevision}.</p>
      {!reward.archivedAt && store.state !== 'CLOSED' && <div className="stores-actions"><Link className="primary-link" href={`${rewardPath(store.id, reward.id)}/editar`}>Editar mimo</Link>
        <Button ref={archiveTrigger} variant="secondary" onClick={() => setArchiveOpen(true)}>Arquivar mimo</Button></div>}
      <p role="alert">{error}</p>{conflict && <><p>O cadastro ou o estoque mudou. Confira a versão atual antes de arquivar.</p>
        <Button variant="secondary" disabled={busy} onClick={() => { void refresh(); }}>Carregar versão atual</Button></>}
      <Dialog open={archiveOpen} onOpenChange={next => { if (!busy) setArchiveOpen(next); }} title="Arquivar mimo" returnFocusRef={archiveTrigger}>
        <p>Arquivar {reward.name} retira o mimo de novos resgates. Os tickets emitidos permanecem acessíveis. Não será possível desarquivar nesta etapa.</p>
        <p role="alert">{error}</p>{uncertain && <p>O resultado ainda não foi confirmado. Consulte o mesmo arquivamento.</p>}
        <Button disabled={busy || conflict} onClick={() => { void archive(); }}>{uncertain ? 'Consultar arquivamento' : 'Confirmar arquivamento'}</Button></Dialog></> :
      <><RewardAvailabilityText value={reward.availability} storeId={store.id} />
        <RedeemControl store={store} reward={reward} operationId={operationId} recovered={!!operationId} onUpdate={setReward} /></>}
  </section>;
}
function LoadDetail({ store, rewardId, operationId }: { store: StoreView; rewardId: string; operationId?: string }) {
  const { data, error, loading, denied, reload } = useRewardResource<RewardView>(`${apiBase(store.id)}/mimos/${encodeURIComponent(rewardId)}`);
  if (denied) return null;
  if (loading) return <p role="status">Abrindo mimo…</p>;
  if (error || !data) return <section className="stores-card"><h2>Mimo indisponível</h2><p role="alert">{storeError(error)}</p><Button variant="secondary" onClick={reload}>Tentar carregar novamente</Button></section>;
  return <Detail store={store} initial={data} operationId={operationId} />;
}
export function RewardDetail(props: { store: StoreView; rewardId: string; operationId?: string }) {
  return props.operationId ? <RewardRecovery store={props.store} rewardId={props.rewardId} operationId={props.operationId}><LoadDetail {...props} /></RewardRecovery> : <LoadDetail {...props} />;
}
