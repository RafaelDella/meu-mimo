'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { accountRequest, friendlyError } from './account-api';

type Factor = { id: string; name: string };
const sdkSvgPrefix = 'data:image/svg+xml;utf-8,';

export function MfaPanel({ verified, onVerified }: { verified: boolean; onVerified: () => Promise<void> }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const qrSource = qrCode.startsWith(sdkSvgPrefix) ?
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode.slice(sdkSvgPrefix.length))}` : qrCode;

  useEffect(() => {
    const controller = new AbortController();
    accountRequest('mfa', 'GET', undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const available = Array.isArray(result.factors) ? result.factors.flatMap((value: unknown) => {
        if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') return [];
        return [{ id: value.id, name: 'name' in value && typeof value.name === 'string' ? value.name : 'Meu Mimo' }];
      }) : [];
      setFactors(available);
      setFactorId(available[0]?.id ?? '');
    }).catch(cause => { if (!controller.signal.aborted) setError(friendlyError(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function perform(operation: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try { await operation(); } catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  }

  function enroll() {
    void perform(async () => {
      const result = await accountRequest('mfa', 'POST', { action: 'enroll' });
      if (typeof result.factorId !== 'string' || typeof result.qrCode !== 'string' || typeof result.secret !== 'string') {
        throw new Error('Resposta inválida.');
      }
      setFactorId(result.factorId);
      setQrCode(result.qrCode);
      setSecret(result.secret);
      setMessage('Adicione a conta ao seu aplicativo autenticador e confirme o código.');
    });
  }

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform(async () => {
      const challenge = await accountRequest('mfa', 'POST', { action: 'challenge', factorId });
      if (typeof challenge.challengeId !== 'string') throw new Error('Resposta inválida.');
      await accountRequest('mfa', 'POST', { action: 'verify', factorId, challengeId: challenge.challengeId, code });
      setCode('');
      setQrCode('');
      setSecret('');
      setMessage('Verificação em duas etapas confirmada.');
      await onVerified();
    });
  }

  return (
    <section className="account-mfa" aria-labelledby="mfa-title" aria-busy={busy || loading}>
      <h2 id="mfa-title">Verificação em duas etapas</h2>
      <p>Uma proteção a mais para sua conta. Obrigatória para acessar a administração.</p>
      <p className="account-feedback" role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <p className="account-error" role="alert" aria-atomic="true">{error}</p>
      {verified ? <StatusBadge tone="success" text="Verificação em duas etapas confirmada" /> : (
        <>
          {!factorId && <Button variant="secondary" disabled={busy || loading} onClick={enroll}>{loading ? 'Conferindo seus aplicativos…' : 'Configurar aplicativo autenticador'}</Button>}
          {!factorId && !loading && <p>Uma configuração anterior ainda não confirmada será substituída ao recomeçar.</p>}
          {qrCode && (
            <div className="account-qr">
              <Image src={qrSource} alt="Código QR para adicionar o Meu Mimo ao aplicativo autenticador" width={240} height={240} unoptimized />
              <div className="account-manual-key">
                <Input label="Chave para configuração manual" type={showSecret ? 'text' : 'password'} value={secret} readOnly autoComplete="off" />
                <Button variant="secondary" onClick={() => setShowSecret(value => !value)} aria-pressed={showSecret}>{showSecret ? 'Ocultar chave' : 'Mostrar chave'}</Button>
              </div>
            </div>
          )}
          {factorId && (
            <form className="account-form" onSubmit={verify}>
              {factors.length > 1 && <label>Aplicativo autenticador<select className="account-select" value={factorId} onChange={event => setFactorId(event.target.value)} disabled={busy}>{factors.map(factor => <option key={factor.id} value={factor.id}>{factor.name}</option>)}</select></label>}
              <Input label="Código do aplicativo autenticador" name="code" value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={busy} hint="Digite os seis números exibidos no aplicativo." />
              <Button type="submit" disabled={busy}>{busy ? 'Conferindo…' : 'Confirmar código'}</Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
