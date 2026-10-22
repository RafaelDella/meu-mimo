'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { RewardView } from '@/contracts/rewards';
import type { RedemptionBody } from '@/contracts/redemptions';
import type { StoreView } from '@/contracts/stores';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { points } from '@/components/activities/format';
import { useRewardAccess } from './access';
import { rewardApi, ticketPath } from './transport';

export function RedeemControl({ store, reward, operationId: initialId, recovered, onUpdate }: {
  store: StoreView; reward: RewardView; operationId?: string; recovered: boolean; onUpdate: (reward: RewardView) => void;
}) {
  const router = useRouter();
  const unavailable = useRewardAccess();
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLParagraphElement>(null);
  const active = useRef<AbortController | null>(null);
  const pending = useRef<RedemptionBody | null>(null);
  const operationId = useRef(initialId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(recovered);
  const [error, setError] = useState('');
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { if (!open && (reviewRequired || uncertain)) title.current?.focus(); }, [open, reviewRequired, uncertain]);
  function persistIntention() {
    operationId.current ??= crypto.randomUUID();
    const url = new URL(window.location.href); url.searchParams.set('operacao', operationId.current);
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }
  async function lookup(signal: AbortSignal) {
    const result = await rewardApi.lookup(store.id, reward.id, operationId.current!, signal);
    if (signal.aborted) return false;
    if (result.ticket) { router.replace(ticketPath(store.id, result.ticket.id)); return true; }
    return false;
  }
  async function inspect() {
    if (active.current || !operationId.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      if (!await lookup(controller.signal) && !controller.signal.aborted) {
        setUncertain(false); setReviewRequired(true); setOpen(false);
        setError('Nenhum ticket foi confirmado para esta intenção. Carregue a prévia atual e confirme novamente se quiser continuar.');
      }
    } catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); setUncertain(true); } }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); title.current?.focus(); } }
  }
  async function review() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const next = await rewardApi.read(store.id, reward.id, controller.signal);
      if (!controller.signal.aborted) { onUpdate(next); pending.current = null; setReviewRequired(false); setOpen(true); }
    } catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); } }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  function begin() {
    if (active.current || !reward.availability?.eligible) return;
    persistIntention(); setError(''); setOpen(true);
  }
  async function confirm() {
    if (active.current || reviewRequired || uncertain || !reward.availability?.eligible) return;
    persistIntention();
    pending.current ??= { operationId: operationId.current!, expectedVersion: reward.version, expectedBalance: reward.availability.available };
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const result = await rewardApi.redeem(store.id, reward.id, pending.current, controller.signal);
      if (!controller.signal.aborted) router.replace(ticketPath(store.id, result.ticket.id));
    } catch (cause) {
      if (controller.signal.aborted) return;
      unavailable(cause); setError(storeError(cause));
      if (cause instanceof StoreRequestError && cause.status === 409) {
        // Mesmo conflitos de corpo consultam a operação antes de outra revisão.
        try {
          if (!await lookup(controller.signal) && !controller.signal.aborted) { setReviewRequired(true); setOpen(false); }
        } catch (lookupCause) { if (!controller.signal.aborted) { unavailable(lookupCause); setUncertain(true); } }
      } else setUncertain(true);
    } finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  const value = reward.availability;
  return <div><p role="alert" ref={title} tabIndex={-1}>{error}</p>
    {uncertain ? <><p role="status">O resultado ainda não foi confirmado. Sua intenção foi preservada. Consulte o resultado antes de tentar novamente.</p>
      <Button variant="secondary" disabled={busy} onClick={() => { void inspect(); }}>Consultar resultado do resgate</Button></> : reviewRequired ?
      <><p role="status">Revise o custo, o saldo e a disponibilidade atuais antes de confirmar a mesma intenção.</p>
        <Button variant="secondary" disabled={busy} onClick={() => { void review(); }}>Carregar nova prévia</Button></> :
      <Button ref={trigger} disabled={busy || !value?.eligible} onClick={begin}>Resgatar mimo</Button>}
    <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }} title="Confirmar resgate" description="Confira o mimo e os pontos antes de confirmar." returnFocusRef={trigger}>
      <p>Loja: {store.name || 'Sua lojinha'}</p><h3>{reward.name}</h3><p>Quantidade: 1 unidade</p>
      <dl className="stores-details"><div><dt>Custo</dt><dd>{points(reward.cost)} pontos</dd></div>
        <div><dt>Saldo disponível</dt><dd>{points(value?.available ?? '0')} pontos</dd></div>
        <div><dt>Saldo após o resgate</dt><dd>{points(value?.resulting ?? '0')} pontos</dd></div></dl>
      <p>O ticket ficará aguardando combinar. Uma unidade será reservada ao confirmar o resgate.</p><p role="alert">{error}</p>
      {uncertain ? <Button disabled={busy} onClick={() => { void inspect(); }}>Consultar resultado do resgate</Button> :
        <Button disabled={busy || !value?.eligible || reviewRequired} onClick={() => { void confirm(); }}>{busy ? 'Confirmando resgate…' : 'Confirmar e resgatar'}</Button>}
    </Dialog>
  </div>;
}

export function RewardRecovery({ store, rewardId, operationId, children }: {
  store: StoreView; rewardId: string; operationId: string; children: ReactNode;
}) {
  const router = useRouter();
  const unavailable = useRewardAccess();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; absent?: boolean; error?: unknown }>();
  useEffect(() => {
    const controller = new AbortController();
    rewardApi.lookup(store.id, rewardId, operationId, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      if (value.ticket) router.replace(ticketPath(store.id, value.ticket.id));
      else setResult({ revision, absent: true });
    }).catch(cause => { if (!controller.signal.aborted) { unavailable(cause); setResult({ revision, error: cause }); } });
    return () => controller.abort();
  }, [store.id, rewardId, operationId, revision, router, unavailable]);
  const current = result?.revision === revision ? result : undefined;
  if (current?.absent) return children;
  return <section className="stores-card"><h2>Consultando seu resgate</h2>{current?.error ? <><p role="alert">{storeError(current.error)}</p>
    <Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Consultar resultado do resgate</Button></> : <p role="status">Consultando a intenção preservada antes de continuar…</p>}
    <p>Esta consulta não emite outro ticket.</p></section>;
}
