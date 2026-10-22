'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { RewardFields, RewardView } from '@/contracts/rewards';
import type { StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { useRewardAccess, useRewardResource } from './access';
import { RewardForm } from './reward-form';
import { apiBase, rewardApi, rewardPath } from './transport';

type Body = RewardFields & { operationId: string; expectedVersion: number; expectedStockRevision: number };
function Editor({ store, initial }: { store: StoreView; initial?: RewardView }) {
  const router = useRouter();
  const unavailable = useRewardAccess();
  const active = useRef<AbortController | null>(null);
  const pending = useRef<Body | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [current, setCurrent] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => () => active.current?.abort(), []);
  async function save(fields: RewardFields) {
    if (active.current || conflict) return;
    pending.current ??= { ...fields, operationId: crypto.randomUUID(), expectedVersion: current?.version ?? 1, expectedStockRevision: current?.stockRevision ?? 0 };
    const body = pending.current;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const { expectedVersion, expectedStockRevision, ...creation } = body;
      const result = current ? await rewardApi.update(store.id, current.id, { ...creation, expectedVersion, expectedStockRevision }, controller.signal) :
        await rewardApi.create(store.id, creation, controller.signal);
      if (!controller.signal.aborted) router.push(rewardPath(store.id, result.reward.id));
    } catch (cause) {
      if (controller.signal.aborted) return;
      unavailable(cause);
      if (cause instanceof StoreRequestError && cause.status === 409) { setConflict(true); pending.current = null; setUncertain(false); }
      else if (cause instanceof StoreRequestError && cause.status === 400 && !uncertain) pending.current = null;
      else setUncertain(true);
      setError(storeError(cause)); title.current?.focus();
    } finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  async function refresh() {
    if (!current || active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true);
    try {
      const next = await rewardApi.read(store.id, current.id, controller.signal);
      if (!controller.signal.aborted) { setCurrent(next); setConflict(false); setError(''); title.current?.focus(); }
    } catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); } }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  return <section className="stores-card"><Link className="stores-link" href={rewardPath(store.id, current?.id)}>Voltar aos mimos</Link>
    <h2 ref={title} tabIndex={-1}>{current ? 'Editar mimo' : 'Novo mimo'}</h2><p role="alert">{error}</p>
    {conflict && <div className="stores-banner"><p>O cadastro ou o estoque mudou desde a abertura. Seus campos estão preservados para copiar. Carregar a versão atual substitui os campos e exige nova revisão da quantidade disponível agora.</p>
      <Button variant="secondary" disabled={busy} onClick={() => { void refresh(); }}>Carregar versão atual</Button></div>}
    {uncertain && <p role="status">O resultado ainda não foi confirmado. Consulte o mesmo salvamento para evitar duplicação.</p>}
    {current?.archivedAt ? <p>Este mimo foi arquivado e está somente para consulta.</p> :
      <RewardForm key={current ? `${current.id}:${current.version}:${current.stockRevision}` : 'new'} initial={current} busy={busy} locked={uncertain || conflict}
        canSubmit={!conflict} submitLabel={uncertain ? 'Consultar salvamento' : 'Salvar mimo'} onSave={fields => { void save(fields); }} />}
  </section>;
}
function LoadEditor({ store, rewardId }: { store: StoreView; rewardId: string }) {
  const { data, error, loading, denied, reload } = useRewardResource<RewardView>(`${apiBase(store.id)}/mimos/${encodeURIComponent(rewardId)}`);
  if (denied) return null;
  if (loading) return <p role="status">Abrindo mimo…</p>;
  if (error || !data) return <section className="stores-card"><h2>Mimo indisponível</h2><p role="alert">{storeError(error)}</p><Button variant="secondary" onClick={reload}>Tentar carregar novamente</Button></section>;
  return <Editor store={store} initial={data} />;
}
export function RewardEditor({ store, rewardId }: { store: StoreView; rewardId?: string }) {
  if (store.role !== 'MERCHANT') return <p role="alert">Esta área é reservada a quem gerencia a loja.</p>;
  if (store.state === 'CLOSED') return <p>Loja encerrada. Os cadastros anteriores continuam disponíveis para consulta.</p>;
  return rewardId ? <LoadEditor store={store} rewardId={rewardId} /> : <Editor store={store} />;
}
