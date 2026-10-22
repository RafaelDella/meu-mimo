'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AccountSession } from '@/app/conta/account-api';
import { Button } from '@/components/ui/button';
import { StoreRequestError, storeError } from './store-api';
import { useCurrentSession } from './use-current-session';

export function PrivateArea({ children }: { children: (session: AccountSession) => ReactNode }) {
  // Só a sessão retém a árvore durante a conferência; uma identidade diferente
  // troca a key abaixo e descarta todos os dados/rascunhos do contexto anterior.
  const { data: session, error, loading, refreshing, reload } = useCurrentSession();
  if (loading) return <p role="status">Conferindo sua conta…</p>;
  if (error || !session || session.recovery) {
    const needsLogin = error instanceof StoreRequestError && [401, 403].includes(error.status);
    const destination = typeof window === 'undefined' ? '/lojas' : window.location.pathname + window.location.search;
    return <section className="stores-card">
      <h2>{session?.recovery ? 'Conclua a recuperação' : 'Acesse sua conta'}</h2>
      <p role="alert">{session?.recovery ? 'Salve sua nova senha para continuar.' : needsLogin ? 'Entre na sua conta para abrir suas lojas.' : storeError(error)}</p>
      <div className="stores-actions"><Link className="primary-link" href={`/conta?returnTo=${encodeURIComponent(destination)}`}>Entrar na conta</Link>
        {!needsLogin && <Button variant="secondary" onClick={reload}>Tentar novamente</Button>}</div>
    </section>;
  }
  return <><p role="status" hidden={!refreshing}>Conferindo sua conta…</p>
    <div key={`${session.userId}:${session.sessionId}`} className="stores-private-area" data-checking={refreshing || undefined}
      hidden={refreshing} inert={refreshing} style={refreshing ? { visibility: 'hidden' } : undefined}>{children(session)}</div></>;
}
