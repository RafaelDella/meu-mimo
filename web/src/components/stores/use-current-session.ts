'use client';

import { useEffect } from 'react';
import type { AccountSession } from '@/app/conta/account-api';
import { useResource } from './store-api';

export function useCurrentSession() {
  const session = useResource<AccountSession>('/api/auth/session', true);
  const reload = session.reload;
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
  return session;
}
