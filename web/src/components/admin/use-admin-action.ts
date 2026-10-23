'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminActionBody, AdminActionLookup, AdminActionResult, AdminTargetRef } from '@/contracts/admin';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { adminRequest, invalidateAdmin, useAdminAccess } from './transport';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function recoveryOperation() { if (typeof window === 'undefined') return null; const id = new URL(window.location.href).searchParams.get('operacao'); return id && uuid.test(id) ? id : null; }
function address(id?: string) { const url = new URL(window.location.href); if (id) url.searchParams.set('operacao', id); else url.searchParams.delete('operacao'); window.history.replaceState(null, '', `${url.pathname}${url.search}`); }
export function useAdminAction(target: AdminTargetRef, onConfirmed: (value: AdminActionResult) => void) {
  const active = useRef<AbortController | null>(null); const pending = useRef<AdminActionBody | null>(null);
  const confirmed = useRef(onConfirmed); useEffect(() => { confirmed.current = onConfirmed; }, [onConfirmed]);
  const [recovering, setRecovering] = useState(recoveryOperation); const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false); const [reviewRequired, setReviewRequired] = useState(false); const [error, setError] = useState('');
  const unavailable = useAdminAccess(); const targetKey = `${target.type}:${target.id}`;
  function accept(value: AdminActionResult) {
    if (`${value.operation.target.type}:${value.operation.target.id}` !== targetKey) throw new StoreRequestError('admin_conflict', 409, 'A operação pertence a outro alvo. Revise o contexto atual.');
    pending.current = null; address(); setUncertain(false); setReviewRequired(false); confirmed.current(value); invalidateAdmin();
  }
  useEffect(() => {
    if (!recovering) return;
    const controller = new AbortController(); active.current = controller;
    adminRequest<AdminActionLookup>(`/api/admin/operacoes/${recovering}`, 'GET', undefined, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      const result = value.operation;
      if (result && `${result.operation.target.type}:${result.operation.target.id}` === targetKey) { address(); confirmed.current(result); invalidateAdmin(); }
      else { address(); setError(result ? 'A operação pertence a outro alvo.' : 'Nenhuma ação foi confirmada. Revise o estado atual antes de continuar.'); setReviewRequired(true); }
    }).catch(cause => { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); setUncertain(true); } })
      .finally(() => { if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setRecovering(null); } });
    return () => { controller.abort(); if (active.current === controller) active.current = null; };
  }, [recovering, targetKey, unavailable]);
  useEffect(() => () => { const controller = active.current; active.current = null; controller?.abort(); }, []);
  async function send(body?: AdminActionBody) {
    if (active.current || reviewRequired) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    if (body && !pending.current) { pending.current = body; address(body.operationId); }
    const intent = pending.current;
    const id = intent?.operationId ?? recoveryOperation();
    try {
      if (!id) throw new StoreRequestError('admin_conflict', 409, 'Revise o alvo antes de uma nova ação.');
      if (uncertain || !body) {
        const lookup = await adminRequest<AdminActionLookup>(`/api/admin/operacoes/${id}`, 'GET', undefined, controller.signal);
        if (controller.signal.aborted) return;
        if (lookup.operation) { accept(lookup.operation); return; }
        if (!intent) { address(); setUncertain(false); setReviewRequired(true); setError('Nenhuma ação foi confirmada. Revise o estado atual.'); return; }
      }
      const result = await adminRequest<AdminActionResult>('/api/admin/acoes', 'POST', intent!, controller.signal);
      if (!controller.signal.aborted) accept(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      unavailable(cause); setError(storeError(cause));
      if (cause instanceof StoreRequestError && [400, 409].includes(cause.status)) { pending.current = null; address(); setUncertain(false); setReviewRequired(true); }
      else setUncertain(true);
    } finally { if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setBusy(false); } }
  }
  return { busy: busy || !!recovering, uncertain, reviewRequired, error, setError, send,
    reviewed: () => { pending.current = null; setReviewRequired(false); setError(''); } };
}
