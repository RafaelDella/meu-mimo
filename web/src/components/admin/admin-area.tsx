'use client';

import { MimoMasthead } from '@/components/ui/mimo-page';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { AccountSession } from '@/app/conta/account-api';
import { PrivateArea } from '@/components/stores/private-area';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { Button } from '@/components/ui/button';
import { AdminAccessContext, adminDenied, adminRequest } from './transport';
import styles from './admin.module.css';

type AdminSession = { actorUserId: string; assuranceLevel: 'aal2' };
function Gate({ session, children }: { session: AccountSession; children(identityKey: string): ReactNode }) {
  const path = usePathname(); const [revision, setRevision] = useState(0); const key = `${path}:${revision}`;
  const [result, setResult] = useState<{ key: string; path: string; data?: AdminSession; error?: unknown }>();
  const [denied, setDenied] = useState<unknown>();
  const heading = useRef<HTMLHeadingElement>(null); const before = useRef<HTMLElement | null>(null);
  const reload = useCallback(() => { if (document.activeElement instanceof HTMLElement) before.current = document.activeElement; setRevision(value => value + 1); }, []);
  const unavailable = useCallback((cause: unknown) => {
    if (!adminDenied(cause)) return;
    setDenied(cause);
    if (cause.status === 401) window.dispatchEvent(new Event('meumimo:session-changed'));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    adminRequest<AdminSession>('/api/admin/session', 'GET', undefined, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data.actorUserId !== session.userId || data.assuranceLevel !== 'aal2' || session.assuranceLevel !== 'aal2') throw new StoreRequestError('admin_forbidden', 403, 'Acesso administrativo não permitido.');
      setDenied(undefined); setResult({ key, path, data });
    }).catch(error => { if (!controller.signal.aborted) setResult({ key, path, error }); });
    return () => controller.abort();
  }, [key, path, session.userId, session.assuranceLevel]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload); window.addEventListener('pageshow', reload); window.addEventListener('meumimo:session-changed', reload); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', reload); window.removeEventListener('pageshow', reload); window.removeEventListener('meumimo:session-changed', reload); document.removeEventListener('visibilitychange', visible); };
  }, [reload]);
  const checking = result?.key !== key; const failure = denied ?? result?.error; const allowed = !denied && !!result?.data && result.path === path;
  useEffect(() => {
    if (checking) return;
    if (failure) heading.current?.focus();
    else if (before.current?.isConnected && document.activeElement === document.body) before.current.focus();
    before.current = null;
  }, [checking, failure, result]);
  const mfa = failure instanceof StoreRequestError && failure.code === 'mfa_required';
  return <AdminAccessContext.Provider value={unavailable}>
    {checking && <p role="status">Conferindo acesso administrativo…</p>}
    {!checking && !allowed && <section className={styles.card}><h1 ref={heading} tabIndex={-1}>{mfa ? 'Confirme o segundo fator' : 'Acesso administrativo indisponível'}</h1>
      <p role="alert">{storeError(failure)}</p><div className={styles.actions}>{mfa ? <Link className="primary-link" href={`/conta?returnTo=${encodeURIComponent(path)}`}>Confirmar segundo fator</Link> : <Button variant="secondary" onClick={reload}>Verificar acesso novamente</Button>}<Link className="stores-link" href="/lojas">Voltar para minhas lojas</Link></div></section>}
    {allowed && <div className={styles.private} hidden={checking} inert={checking} style={checking ? { visibility: 'hidden' } : undefined}>{children(`${session.userId}:${session.sessionId}:aal2`)}</div>}
  </AdminAccessContext.Provider>;
}
export function AdminArea({ children }: { children(identityKey: string): ReactNode }) {
  return <main className="stores-shell"><MimoMasthead /><PrivateArea>{session => <Gate key={`${session.userId}:${session.sessionId}:${session.assuranceLevel}`} session={session}>{children}</Gate>}</PrivateArea></main>;
}
