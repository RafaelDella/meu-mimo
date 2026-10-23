'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TicketAction, TicketTransitionBody, TicketTransitionMutation, TicketView } from '@/contracts/redemptions';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { accessDenied, useRewardAccess } from '@/components/rewards/access';
import { useTicketSummary } from '@/components/rewards/reward-summary';
import type { TicketDraft } from './ticket-action-form';
import { eventLabels } from './action-labels';
import { ticketStatuses } from './ticket-display';
import { ticketApi } from './transport';

function opaqueId(value: string | null) { return value && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value) ? value : undefined; }
function preserveOperation(value?: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set('transicao', value); else url.searchParams.delete('transicao');
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}
export function useTicketTransition(ticket: TicketView, onUpdate: (ticket: TicketView) => void) {
  const query = useSearchParams();
  const [initial] = useState(() => opaqueId(query.get('transicao')));
  const operation = useRef(initial);
  const pending = useRef<TicketTransitionBody | null>(null);
  const active = useRef<AbortController | null>(null);
  const unavailable = useRewardAccess();
  const reloadSummary = useTicketSummary()?.reload;
  const [stage, setStage] = useState<'idle' | 'uncertain' | 'review'>(initial ? 'uncertain' : 'idle');
  const [action, setAction] = useState<TicketAction | null>(null);
  const [draft, setDraft] = useState<TicketDraft>({ text: '', agreementDate: '', restock: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const accept = useCallback((value: TicketTransitionMutation) => {
    onUpdate(value.ticket); reloadSummary?.(); setAction(null); setStage('idle'); setError('');
    setNotice(`${eventLabels[value.event.kind]}: operação da versão ${value.appliedVersion} confirmada. Estado atual: ${ticketStatuses[value.ticket.status]}.`);
    pending.current = null; operation.current = undefined; preserveOperation();
  }, [onUpdate, reloadSummary]);
  const inspectResult = useCallback(async (signal: AbortSignal) => {
    if (!operation.current) return false;
    const value = await ticketApi.lookup(ticket.storeId, ticket.id, operation.current, signal);
    if (signal.aborted) return false;
    if (value.operation) { accept(value.operation); return true; }
    setStage('review'); setAction(null);
    setError('Nenhuma operação foi confirmada para esta intenção. Consulte o estado atual e revise os dados antes de confirmar novamente.');
    return false;
  }, [ticket.storeId, ticket.id, accept]);
  useEffect(() => {
    if (!initial) return;
    const controller = new AbortController(); active.current = controller;
    inspectResult(controller.signal).catch(cause => {
      if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); }
    }).finally(() => { if (!controller.signal.aborted) active.current = null; });
    return () => controller.abort();
  }, [initial, inspectResult, unavailable]);
  useEffect(() => () => active.current?.abort(), []);
  async function inspect() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try { await inspectResult(controller.signal); }
    catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); setStage('uncertain'); } }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  async function review() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    const previous = pending.current?.action;
    try {
      const current = await ticketApi.read(ticket.storeId, ticket.id, controller.signal);
      if (controller.signal.aborted) return;
      onUpdate(current); reloadSummary?.(); pending.current = null; operation.current = undefined; preserveOperation();
      setDraft(value => ({ ...value, restock: false })); setStage('idle');
      setAction(previous && current.actions.includes(previous) ? previous : null);
      setNotice('Estado atual consultado. Revise os dados e confirme explicitamente se quiser continuar.');
    } catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); } }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  function begin(next: TicketAction) {
    if (busy || stage !== 'idle' || !ticket.actions.includes(next)) return;
    setAction(next); setError(''); setNotice('');
    setDraft({ text: next === 'AGREE' ? ticket.agreementText : '', agreementDate: next === 'AGREE' ? ticket.agreementDate ?? '' : '', restock: false });
  }
  async function confirm(value: TicketDraft) {
    if (active.current || stage !== 'idle' || !action || !ticket.actions.includes(action)) return;
    operation.current ??= crypto.randomUUID(); preserveOperation(operation.current);
    const base = { operationId: operation.current, expectedVersion: ticket.version };
    pending.current ??= action === 'FULFILL' ? { ...base, action } : action === 'AGREE' ?
      { ...base, action, text: value.text, agreementDate: value.agreementDate || null } : action === 'CANCEL' ?
        { ...base, action, text: value.text, expectedBalance: ticket.cancellationImpact!.balanceBefore, restock: value.restock,
          ...(value.restock ? { expectedStockRevision: ticket.cancellationImpact!.restock.stockRevision } : {}) } : { ...base, action, text: value.text };
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const result = await ticketApi.transition(ticket.storeId, ticket.id, pending.current, controller.signal);
      if (!controller.signal.aborted) accept(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      unavailable(cause); setError(storeError(cause));
      if (accessDenied(cause)) return;
      setStage('uncertain');
      if (cause instanceof StoreRequestError && cause.status === 409) {
        try { await inspectResult(controller.signal); }
        catch (lookupCause) { if (!controller.signal.aborted) { unavailable(lookupCause); setError(storeError(lookupCause)); } }
      }
    } finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  return { action, setAction, draft, setDraft, stage, busy, error, notice, begin, confirm, inspect, review };
}
