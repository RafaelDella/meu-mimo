'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { MfaPanel } from './mfa-panel';
import { AccountRequestError, accountRequest, accountSession, friendlyError } from './account-api';
import type { AccountSession } from './account-api';

type Mode = 'login' | 'signup' | 'recovery';

export function AccountPanel() {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    accountRequest('session', 'GET', undefined, controller.signal)
      .then(value => { if (!controller.signal.aborted) setSession(accountSession(value)); })
      .catch(cause => {
        if (controller.signal.aborted) return;
        if (!(cause instanceof AccountRequestError) ||
            !['identity_missing', 'session_invalid'].includes(cause.code)) setError(friendlyError(cause));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function refreshSession() {
    setSession(accountSession(await accountRequest('session')));
  }

  async function perform(operation: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    setError('');
    try { await operation(); } catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  }

  function selectMode(next: Mode) {
    setMode(next);
    setPassword('');
    setMessage('');
    setError('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform(async () => {
      if (session?.recovery) {
        const result = await accountRequest('recovery', 'PATCH', { password });
        setPassword('');
        await refreshSession();
        setMessage(typeof result.message === 'string' ? result.message : 'Sua senha foi atualizada.');
        return;
      }
      const returnTo = new URLSearchParams(window.location.search).get('returnTo');
      const result = await accountRequest(mode, 'POST', { email, ...(mode !== 'recovery' ? { password } : {}), returnTo });
      setPassword('');
      if (mode === 'login') {
        await refreshSession();
        setMessage('Que bom ter você de volta!');
        const destination = result.returnTo;
        if (typeof destination === 'string' && destination.startsWith('/') && !destination.startsWith('//') &&
            destination !== '/conta' && new URL(destination, window.location.origin).origin === window.location.origin) {
          window.location.assign(destination);
        }
      } else {
        setMessage(typeof result.message === 'string' ? result.message : 'Confira seu e-mail para continuar.');
      }
    });
  }

  const passwordLabel = session?.recovery ? 'Nova senha' : 'Senha';
  const submitLabel = session?.recovery ? 'Salvar nova senha' :
    mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de recuperação';

  return (
    <section className="account-card" aria-labelledby="account-title" aria-busy={loading || busy}>
      <h2 id="account-title">{session ? 'Sua conta' : 'Vamos começar?'}</h2>
      <p className="account-feedback" role="status" aria-live="polite" aria-atomic="true">{loading ? 'Conferindo sua conta…' : message}</p>
      <p className="account-error" id="account-error" role="alert" aria-atomic="true">{error}</p>
      {!session && (
        <nav className="account-tabs" aria-label="Acesso à conta">
          <Button disabled={busy || loading} variant={mode === 'login' ? 'primary' : 'secondary'} aria-pressed={mode === 'login'} onClick={() => selectMode('login')}>Entrar</Button>
          <Button disabled={busy || loading} variant={mode === 'signup' ? 'primary' : 'secondary'} aria-pressed={mode === 'signup'} onClick={() => selectMode('signup')}>Criar conta</Button>
          <Button disabled={busy || loading} variant={mode === 'recovery' ? 'primary' : 'secondary'} aria-pressed={mode === 'recovery'} onClick={() => selectMode('recovery')}>Recuperar senha</Button>
        </nav>
      )}
      {(!session || session.recovery) && (
        <form className="account-form" onSubmit={submit} aria-describedby="account-error">
          {session?.recovery ? <p>Escolha uma nova senha para voltar ao seu cantinho.</p> : (
            <Input label="E-mail" name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" maxLength={254} required disabled={loading || busy} />
          )}
          {(session?.recovery || mode !== 'recovery') && (
            <Input label={passwordLabel} name="password" type="password" value={password} onChange={event => setPassword(event.target.value)}
              autoComplete={session?.recovery || mode === 'signup' ? 'new-password' : 'current-password'}
              hint={session?.recovery || mode === 'signup' ? 'Use pelo menos oito caracteres.' : undefined}
              minLength={session?.recovery || mode === 'signup' ? 8 : 1} maxLength={256} required disabled={loading || busy} />
          )}
          <Button type="submit" disabled={loading || busy}>{busy ? 'Só um instante…' : submitLabel}</Button>
        </form>
      )}
      {session && (
        <div className="account-status">
          {!session.recovery && <StatusBadge tone="success" text="Você está na sua conta" />}
          <div className="account-actions">
            <Button variant="secondary" disabled={busy} onClick={() => void perform(async () => {
              await accountRequest('logout', 'POST', {});
              setSession(null);
              setEmail('');
              setPassword('');
              setMessage('Você saiu da sua conta.');
            })}>Sair da conta</Button>
          </div>
          {!session.recovery && <MfaPanel verified={session.assuranceLevel === 'aal2'} onVerified={refreshSession} />}
        </div>
      )}
    </section>
  );
}
