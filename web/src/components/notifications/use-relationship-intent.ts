'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { StoreRequestError, storeError, storeRequest } from '@/components/stores/store-api';
import { useRewardAccess } from '@/components/rewards/access';
import { invalidateRelationship } from './relationship-refresh';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function address(key: string, id?: string) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(key, id); else url.searchParams.delete(key);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
export function useRelationshipIntent<B extends { operationId: string }, R>({ path, method, queryKey, onConfirmed, onConflict }: {
  path: string; method: 'PATCH' | 'PUT'; queryKey: string;
  onConfirmed(value: R): void; onConflict(): void;
}) {
  const active = useRef<AbortController | null>(null);
  const pending = useRef<B | null>(null);
  const callbacks = useRef({ onConfirmed, onConflict });
  useEffect(() => { callbacks.current = { onConfirmed, onConflict }; }, [onConfirmed, onConflict]);
  const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [recoveringId, setRecoveringId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const id = new URL(window.location.href).searchParams.get(queryKey); return id && uuid.test(id) ? id : null;
  });
  const unavailable = useRewardAccess();
  const run = useCallback(async (body?: B, lookupOnly = false) => {
    if (active.current) return;
    const operationId = body?.operationId ?? new URL(window.location.href).searchParams.get(queryKey);
    if (!operationId || !uuid.test(operationId)) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError(''); setMessage('');
    if (body) { pending.current = body; address(queryKey, operationId); }
    try {
      let value: R | null = null;
      if (lookupOnly) value = (await storeRequest<{ operation: R | null }>(`${path}/operacoes/${operationId}`, 'GET', undefined, controller.signal)).operation;
      if (!value && body) value = await storeRequest<R>(path, method, body, controller.signal);
      if (controller.signal.aborted) return;
      if (value) {
        pending.current = null; setUncertain(false); address(queryKey); callbacks.current.onConfirmed(value);
        setMessage('Alteração confirmada.'); invalidateRelationship();
      } else {
        setUncertain(false); address(queryKey); setMessage('A operação não foi aplicada. Revise os dados antes de um novo envio.');
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      unavailable(cause); setError(storeError(cause));
      if (cause instanceof StoreRequestError && [400, 409].includes(cause.status)) {
        pending.current = null; setUncertain(false); address(queryKey); callbacks.current.onConflict();
      } else setUncertain(true);
    } finally {
      if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }, [path, method, queryKey, unavailable]);
  useEffect(() => {
    if (!recoveringId) return;
    const controller = new AbortController(); active.current = controller;
    storeRequest<{ operation: R | null }>(`${path}/operacoes/${recoveringId}`, 'GET', undefined, controller.signal)
      .then(({ operation }) => {
        if (controller.signal.aborted) return;
        address(queryKey);
        if (operation) { callbacks.current.onConfirmed(operation); setMessage('Alteração confirmada.'); invalidateRelationship(); }
        else setMessage('A operação não foi aplicada. Revise os dados antes de um novo envio.');
      }).catch(cause => {
        if (controller.signal.aborted) return;
        unavailable(cause); setError(storeError(cause)); setUncertain(true);
      }).finally(() => {
        if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setRecoveringId(null); }
      });
    return () => { controller.abort(); if (active.current === controller) active.current = null; };
  }, [recoveringId, path, queryKey, unavailable]);
  useEffect(() => {
    return () => { const controller = active.current; active.current = null; controller?.abort(); };
  }, []);
  return { busy: busy || !!recoveringId, uncertain, error, message, setError, send: (body: B) => run(body),
    retry: () => run(pending.current ?? undefined, true) };
}
