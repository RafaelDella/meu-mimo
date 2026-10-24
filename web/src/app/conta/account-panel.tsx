'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { MfaPanel } from './mfa-panel';
import { AccountRequestError, accountRequest, accountSession, friendlyError, notifySessionChanged } from './account-api';
import type { AccountSession } from './account-api';
import { ProfilePanel } from './profile-panel';
import { NotificationSettingsSection } from '@/components/notifications/notification-preferences';
import { AdminEntry } from '@/components/admin/admin-entry';
import { MimoIcon } from '@/components/ui/mimo-icon';
import { AccountAccess } from './account-access';
import type { AccessMode } from './account-access';

export function AccountPanel() {
  const [session, setSession] = useState<AccountSession | null>(null);
  const sessionRef = useRef<AccountSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AccessMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const busyRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);

  useEffect(() => {
    if (moveFocus.current && !checking) { headingRef.current?.focus(); moveFocus.current = false; }
  }, [mode, sent, session?.sessionId, session?.recovery, checking]);

  useEffect(() => {
    const controller = new AbortController();
    let revision = 0;
    function check(background = false) {
      const request = ++revision;
      if (background) setChecking(true);
      accountRequest('session', 'GET', undefined, controller.signal).then(value => {
        if (controller.signal.aborted || request !== revision) return;
        const next = accountSession(value);
        if (sessionRef.current?.sessionId !== next.sessionId || sessionRef.current?.recovery !== next.recovery) {
          setEmail(''); setPassword(''); setSent(false);
        }
        sessionRef.current = next; setSession(next);
      }).catch(cause => {
        if (controller.signal.aborted || request !== revision) return;
        if (sessionRef.current) {
          setEmail(''); setPassword(''); setMessage(''); setError(''); setSent(false); setMode('login');
        }
        sessionRef.current = null; setSession(null);
        if (!(cause instanceof AccountRequestError) || !['identity_missing', 'session_invalid'].includes(cause.code)) setError(friendlyError(cause));
      }).finally(() => {
        if (!controller.signal.aborted && request === revision) { setLoading(false); setChecking(false); }
      });
    }
    void Promise.resolve().then(() => { if (!controller.signal.aborted) check(); });
    const recheck = () => check(true);
    const visible = () => { if (document.visibilityState === 'visible') recheck(); };
    window.addEventListener('focus', recheck);
    window.addEventListener('pageshow', recheck);
    window.addEventListener('meumimo:session-changed', recheck);
    document.addEventListener('visibilitychange', visible);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('meumimo-session');
    if (channel) channel.onmessage = recheck;
    return () => {
      controller.abort(); channel?.close();
      window.removeEventListener('focus', recheck); window.removeEventListener('pageshow', recheck);
      window.removeEventListener('meumimo:session-changed', recheck); document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  async function refreshSession(focus = false) {
    const next = accountSession(await accountRequest('session'));
    if (focus) moveFocus.current = true;
    sessionRef.current = next;
    setSession(next);
    setEmail('');
  }

  async function perform(operation: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    try { await operation(); } catch (cause) { setError(friendlyError(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function selectMode(next: AccessMode) {
    if (busyRef.current) return;
    if (next === mode && !sent) return;
    moveFocus.current = true;
    setMode(next);
    setSent(false);
    setPassword('');
    setMessage('');
    setError('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || checking || busyRef.current) return;
    void perform(async () => {
      if (session?.recovery) {
        const result = await accountRequest('recovery', 'PATCH', { password });
        setPassword('');
        await refreshSession(true);
        setMessage(typeof result.message === 'string' ? result.message : 'Sua senha foi atualizada.');
        return;
      }
      const returnTo = new URLSearchParams(window.location.search).get('returnTo');
      const result = await accountRequest(mode, 'POST', { email, ...(mode !== 'recovery' ? { password } : {}), returnTo });
      setPassword('');
      if (mode === 'login') {
        await refreshSession(true);
        notifySessionChanged();
        setMessage('Que bom ter você de volta!');
        const destination = result.returnTo;
        if (typeof destination === 'string' && destination.startsWith('/') && !destination.startsWith('//') &&
            destination !== '/conta' && new URL(destination, window.location.origin).origin === window.location.origin) {
          window.location.assign(destination);
        }
      } else {
        setMessage(typeof result.message === 'string' ? result.message : 'Confira seu e-mail para continuar.');
        moveFocus.current = true;
        setSent(true);
      }
    });
  }

  const title = session?.recovery ? 'Uma nova senha, um novo começo' : session ? 'Sua conta' : sent ? 'Confira seu e-mail' :
    mode === 'signup' ? 'Crie sua conta' : mode === 'recovery' ? 'Recupere seu acesso' : 'Entre no seu cantinho';
  const description = session?.recovery ? 'Escolha uma nova senha para voltar ao seu cantinho.' : session ? '' : sent ?
    'Falta só continuar pelo link de confirmação.' : mode === 'signup' ? 'O primeiro passo para criar ou participar de uma lojinha.' :
    mode === 'recovery' ? 'Informe seu e-mail para receber um link de recuperação.' : 'Seus mimos e suas conquistas estão esperando por você.';

  return (
    <section className="account-card" aria-labelledby="account-title" aria-busy={loading || busy || checking}>
      <MimoIcon name="bow" className="account-bow" />
      <p className="mimo-eyebrow">{session ? 'Tudo no seu cantinho' : mode === 'signup' ? 'O primeiro de muitos carinhos' : mode === 'recovery' ? 'Vamos cuidar do seu acesso' : 'Que bom ter você por aqui'}</p>
      <h2 id="account-title" ref={headingRef} tabIndex={-1}>{title}</h2>
      <p id="account-description" className="account-description">{description}</p>
      <p className="account-feedback" role="status" aria-live="polite" aria-atomic="true">{loading || checking ? 'Conferindo sua conta…' : message}</p>
      <p className="account-error" id="account-error" role="alert" aria-atomic="true">{error}</p>
      {(!session || session.recovery) && (
        <AccountAccess mode={mode} recovery={session?.recovery ?? false} busy={busy} loading={loading} checking={checking}
          sent={sent} email={email} password={password} onMode={selectMode} onEmail={setEmail} onPassword={setPassword} onSubmit={submit}
          onEdit={() => { moveFocus.current = true; setSent(false); setMessage(''); }} />
      )}
      {session && (
        <div className="account-status" hidden={checking} inert={checking}>
          {!session.recovery && <StatusBadge tone="success" text="Você está na sua conta" />}
          {!session.recovery && <p><Link className="primary-link" href="/lojas">Minhas lojas</Link></p>}
          {!session.recovery && <AdminEntry key={`admin:${session.userId}:${session.sessionId}:${session.assuranceLevel}`} />}
          {!session.recovery && <ProfilePanel key={`${session.userId}:${session.sessionId}`} />}
          {!session.recovery && <NotificationSettingsSection key={`notices:${session.userId}:${session.sessionId}`} accountKey={`${session.userId}:${session.sessionId}`} />}
          <div className="account-actions">
            <Button variant="secondary" disabled={busy} onClick={() => void perform(async () => {
              await accountRequest('logout', 'POST', {});
              notifySessionChanged();
              moveFocus.current = true;
              sessionRef.current = null;
              setSession(null);
              setEmail('');
              setPassword('');
              setSent(false);
              setMode('login');
              setMessage('Você saiu da sua conta.');
            })}>Sair da conta</Button>
          </div>
          {!session.recovery && <MfaPanel key={`${session.userId}:${session.sessionId}`} verified={session.assuranceLevel === 'aal2'} onVerified={refreshSession} />}
        </div>
      )}
    </section>
  );
}
