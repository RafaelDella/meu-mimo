'use client';

import { useEffect, useRef, useState } from 'react';
import type { ResponseBody, ReviewBody, ReviewMutation, SubmissionView } from '@/contracts/activities';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { reviewApi } from './transport';
import type { ReviewContext } from './transport';

type Operation = { kind: 'review'; body: ReviewBody } | { kind: 'respond'; body: ResponseBody };
export function useReviewOperation(context: ReviewContext, onUpdate: (value: SubmissionView) => void, onUnavailable: () => void,
  onConfirmed?: (value: ReviewMutation) => void) {
  const active = useRef<AbortController | null>(null);
  const pending = useRef<Operation | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReviewMutation | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function unavailable(cause: unknown) {
    if (!(cause instanceof StoreRequestError) || ![401, 403, 404].includes(cause.status)) return false;
    pending.current = null; setUncertain(false); onUnavailable();
    if (cause.status === 401) window.dispatchEvent(new Event('meumimo:session-changed'));
    return true;
  }
  async function submit(operation: Operation) {
    if (active.current || needsReview) return;
    pending.current ??= operation;
    const saved = pending.current;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setResult(null);
    try {
      let confirmed: ReviewMutation | undefined;
      if (uncertain) {
        try { confirmed = await reviewApi.operation(context, saved.body.operationId, controller.signal); }
        catch (cause) { if (!(cause instanceof StoreRequestError && cause.status === 404)) throw cause; }
      }
      if (!confirmed) confirmed = saved.kind === 'review' ? await reviewApi.review(context, saved.body, controller.signal) :
        await reviewApi.respond(context, saved.body, controller.signal);
      if (controller.signal.aborted) return;
      pending.current = null; setUncertain(false); setResult(confirmed); onUpdate(confirmed.submission); onConfirmed?.(confirmed);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (!unavailable(cause)) {
        if (cause instanceof StoreRequestError && cause.status === 409) {
          pending.current = null; setUncertain(false); setNeedsReview(true);
        } else if (cause instanceof StoreRequestError && cause.status === 400 && !uncertain) pending.current = null;
        else setUncertain(true);
        setError(storeError(cause));
      }
    } finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  async function refresh() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const value = await reviewApi.submission(context, controller.signal);
      if (!controller.signal.aborted) { onUpdate(value); setNeedsReview(false); }
    } catch (cause) { if (!controller.signal.aborted && !unavailable(cause)) setError(storeError(cause)); }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  function clear() { if (!busy && !uncertain) { setError(''); setNeedsReview(false); setResult(null); pending.current = null; } }
  return { busy, uncertain, needsReview, error, result, submit, refresh, clear };
}
