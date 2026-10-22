'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { AlbumPublicationBody, AlbumPublicationMutation, TicketAlbumPage } from '@/contracts/albums';
import { accessDenied, useRewardAccess } from '@/components/rewards/access';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { albumApi } from './transport';

function operationId(value: string | null) { return value && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value) ? value : undefined; }
function preserve(value?: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set('publicacao', value); else url.searchParams.delete('publicacao');
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}
export function useAlbumPublication(base: string, onUpdate: (album: TicketAlbumPage) => void, canRecover: boolean) {
  const query = useSearchParams();
  const [initial] = useState(() => canRecover ? operationId(query.get('publicacao')) : undefined);
  const operation = useRef(initial);
  const pending = useRef<AlbumPublicationBody | null>(null);
  const active = useRef<AbortController | null>(null);
  const unavailable = useRewardAccess();
  const [stage, setStage] = useState<'idle' | 'uncertain' | 'review'>(initial ? 'uncertain' : 'idle');
  const [busy, setBusy] = useState(!!initial);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState(0);
  const accept = useCallback((value: AlbumPublicationMutation) => {
    onUpdate(value.album); pending.current = null; operation.current = undefined; preserve();
    setStage('idle'); setError(''); setConfirmed(count => count + 1);
    setNotice(`Publicação da versão ${value.appliedVersion} confirmada. ${value.publication.assetIds.length} momentos publicados.`);
  }, [onUpdate]);
  const inspectResult = useCallback(async (signal: AbortSignal) => {
    if (!operation.current) return;
    const result = await albumApi.lookup(base, operation.current, signal);
    if (signal.aborted) return;
    if (result.operation) { accept(result.operation); return; }
    setStage('review'); setError('Nenhuma publicação foi confirmada para esta intenção. Consulte o álbum e revise antes de confirmar uma nova publicação.');
  }, [base, accept]);
  useEffect(() => {
    if (!initial) return;
    const controller = new AbortController(); active.current = controller;
    inspectResult(controller.signal).catch(cause => {
      if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); }
    }).finally(() => { if (!controller.signal.aborted) { active.current = null; setBusy(false); } });
    return () => controller.abort();
  }, [initial, inspectResult, unavailable]);
  useEffect(() => () => active.current?.abort(), []);
  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try { await operation(controller.signal); }
    catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); } }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  async function publish(album: TicketAlbumPage, items: AlbumPublicationBody['items']) {
    if (stage !== 'idle' || active.current) return;
    operation.current ??= crypto.randomUUID(); preserve(operation.current);
    pending.current ??= { operationId: operation.current, expectedVersion: album.version, items };
    await run(async signal => {
      try { const result = await albumApi.publish(base, pending.current!, signal); if (!signal.aborted) accept(result); }
      catch (cause) {
        if (signal.aborted) return;
        unavailable(cause); setError(storeError(cause));
        if (accessDenied(cause)) return;
        setStage('uncertain');
        if (cause instanceof StoreRequestError && cause.status === 409) await inspectResult(signal);
      }
    });
  }
  async function review() {
    await run(async signal => {
      const current = await albumApi.read(base, signal);
      if (signal.aborted) return;
      onUpdate(current); pending.current = null; operation.current = undefined; preserve();
      setStage('idle'); setNotice('Álbum consultado. Revise as legendas, a ordem e a seleção antes de confirmar uma nova intenção.');
    });
  }
  return { stage, busy, error, notice, confirmed, publish, review, inspect: () => run(inspectResult) };
}
