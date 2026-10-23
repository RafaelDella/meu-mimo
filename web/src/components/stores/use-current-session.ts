'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { AccountSession } from '@/app/conta/account-api';
import { useResource } from './store-api';

export function useCurrentSession() {
  const session = useResource<AccountSession>('/api/auth/session', true);
  const focusBeforeRefreshRef = useRef<HTMLElement | null>(null);
  const refreshSession = session.reload;
  const reload = useCallback(() => {
    const element = document.activeElement;
    if (element instanceof HTMLElement && element.closest('.stores-private-area')) focusBeforeRefreshRef.current = element;
    refreshSession();
  }, [refreshSession]);
  useEffect(() => {
    function visible() { if (document.visibilityState === 'visible') reload(); }
    window.addEventListener('focus', reload);
    window.addEventListener('pageshow', reload);
    window.addEventListener('meumimo:session-changed', reload);
    document.addEventListener('visibilitychange', visible);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('meumimo-session');
    if (channel) channel.onmessage = reload;
    return () => {
      window.removeEventListener('focus', reload);
      window.removeEventListener('pageshow', reload);
      window.removeEventListener('meumimo:session-changed', reload);
      document.removeEventListener('visibilitychange', visible);
      channel?.close();
    };
  }, [reload]);
  useEffect(() => {
    if (session.loading || session.refreshing) return;
    const element = focusBeforeRefreshRef.current;
    focusBeforeRefreshRef.current = null;
    // A identidade diferente desmonta a árvore antiga. Restaurar apenas o foco
    // da mesma árvore autorizada, sem substituir uma escolha feita fora dela.
    if (session.data && !session.data.recovery && !session.error && element?.isConnected &&
        document.activeElement === document.body) element.focus();
  }, [session.data, session.error, session.loading, session.refreshing]);
  return { ...session, reload };
}
