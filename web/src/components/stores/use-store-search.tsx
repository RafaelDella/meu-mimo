'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreSearchInput, StoreSearchResult } from '@/contracts/invitations';
import { normalizeInvitationCode } from '@/lib/invitation-code';
import { StoreRequestError, storeRequest } from './store-api';

type Search = { input: StoreSearchInput; revision: number };
type SearchResponse = { key: string; value?: StoreSearchResult; error?: unknown };

/** A credencial fica somente no corpo da consulta e na memória desta sessão. */
export function useStoreSearch(sessionKey: string) {
  const [search, setSearch] = useState<Search>({
    input: { q: '', role: 'PARTICIPANT', page: 1, pageSize: 20, resolveInvitation: false }, revision: 0,
  });
  const [response, setResponse] = useState<SearchResponse>();
  const [dismissed, setDismissed] = useState('');
  const active = useRef<AbortController | null>(null);
  const authNotified = useRef(false);
  const key = `${sessionKey}:${search.revision}`;
  const change = useCallback((patch: Partial<StoreSearchInput>) => {
    active.current?.abort();
    setSearch(previous => ({ input: { ...previous.input, ...patch }, revision: previous.revision + 1 }));
  }, []);
  const reload = useCallback(() => change({ resolveInvitation: false }), [change]);
  const dismiss = useCallback(() => setDismissed(key), [key]);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    storeRequest<StoreSearchResult>('/api/lojas/buscar', 'POST', search.input, controller.signal, { notifyChange: false })
      .then(value => {
        if (!controller.signal.aborted) { authNotified.current = false; setResponse({ key, value }); }
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setResponse({ key, error });
        if (!authNotified.current && error instanceof StoreRequestError && [401, 403].includes(error.status)) {
          authNotified.current = true;
          window.dispatchEvent(new Event('meumimo:session-changed'));
        }
      });
    return () => controller.abort();
  }, [key, search.input]);

  useEffect(() => {
    // Um dialog nativo fica na top layer. Fechá-lo explicitamente evita que
    // sobreviva à árvore privada ocultada enquanto a sessão é conferida.
    function invalidate() { reload(); }
    function visible() { if (document.visibilityState === 'visible') invalidate(); }
    window.addEventListener('focus', invalidate);
    window.addEventListener('pageshow', invalidate);
    window.addEventListener('meumimo:session-changed', invalidate);
    window.addEventListener('meumimo:relationship-changed', invalidate);
    document.addEventListener('visibilitychange', visible);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('meumimo-session');
    if (channel) channel.onmessage = invalidate;
    return () => {
      active.current?.abort();
      window.removeEventListener('focus', invalidate);
      window.removeEventListener('pageshow', invalidate);
      window.removeEventListener('meumimo:session-changed', invalidate);
      window.removeEventListener('meumimo:relationship-changed', invalidate);
      document.removeEventListener('visibilitychange', visible);
      channel?.close();
    };
  }, [reload]);

  const current = response?.key === key ? response : undefined;
  return {
    input: search.input, data: current?.value?.stores, error: current?.error, loading: !current, reload,
    invitation: dismissed !== key ? current?.value?.invitation : null,
    code: normalizeInvitationCode(search.input.q), requestKey: key, dismiss,
    submit: (q: string) => change({ q: q.trim(), page: 1, resolveInvitation: true }),
    filter: (patch: Partial<StoreSearchInput>) => change({ ...patch, page: 1, resolveInvitation: false }),
    setPage: (page: number) => change({ page, resolveInvitation: false }),
  };
}
