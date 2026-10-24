'use client';

import { useId, useRef, useState } from 'react';
import type { CodeInvitationView, InvitationCredential, ManagedInvitation } from '@/contracts/invitations';
import { displayInvitationCode } from '@/lib/invitation-code';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmAction, Feedback } from './store-controls';
import { StoreRequestError, storeRequest, useStoreAction } from './store-api';
import { InvitationCodeDisplay } from './invitation-code-display';
import styles from './invitation-codes.module.css';

const statuses = { PENDING: 'Disponível', EXPIRED: 'Expirado', REVOKED: 'Revogado', EXHAUSTED: 'Esgotado', PAUSED: 'Pausado', CLOSED: 'Loja encerrada' };

export function invitationStatus(invitation: ManagedInvitation) {
  if ('kind' in invitation) return statuses[invitation.status];
  if (invitation.revokedAt) return 'Revogado';
  if (invitation.acceptedAt) return 'Aceito';
  return Date.parse(invitation.expiresAt) <= Date.now() ? 'Expirado' : 'Pendente';
}

export function InvitationPolicyDetails({ invitation, timezone }: { invitation: CodeInvitationView; timezone: string }) {
  return <dl className={styles.metadata}>
    <div><dt>Validade</dt><dd>{invitation.expiresAt ? <><time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleString('pt-BR', { timeZone: timezone })}</time> · {timezone}</> : 'Sem vencimento'}</dd></div>
    <div><dt>Novas participações</dt><dd>{invitation.maxUses === null ? `${invitation.useCount} novas participações · ilimitadas` :
      `${invitation.useCount} de ${invitation.maxUses.toLocaleString('pt-BR')} novas participações`}</dd></div>
  </dl>;
}

export function InvitationCredentialActions({ credential, storeName }: {
  credential: InvitationCredential; storeName: string | null;
}) {
  const action = useStoreAction();
  const codeField = useRef<HTMLInputElement>(null);
  const linkField = useRef<HTMLInputElement>(null);
  const [showCodeField, setShowCodeField] = useState(false);
  function fallback(kind: 'code' | 'url') {
    if (kind === 'code') setShowCodeField(true);
    requestAnimationFrame(() => {
      const field = kind === 'code' ? codeField.current : linkField.current;
      field?.focus(); field?.select();
    });
  }
  function copy(kind: 'code' | 'url') {
    void action.run(async () => {
      const value = kind === 'code' ? displayInvitationCode(credential.code) : new URL(credential.url, window.location.origin).href;
      try {
        if (!navigator.clipboard) throw new Error('clipboard_unavailable');
        await navigator.clipboard.writeText(value);
      } catch {
        fallback(kind);
        throw new StoreRequestError('clipboard_unavailable', 400, `Selecione e copie o ${kind === 'code' ? 'código' : 'link'} no campo indicado.`);
      }
    }, () => action.setMessage(kind === 'code' ? 'Código copiado.' : 'Link copiado.'));
  }
  function share() {
    void action.run(async () => {
      if (!navigator.share) {
        fallback('url');
        throw new StoreRequestError('share_unavailable', 400, 'O compartilhamento do dispositivo não está disponível. Copie o link para compartilhar.');
      }
      try { await navigator.share({ title: `Convite para ${storeName || 'uma lojinha'}`, url: new URL(credential.url, window.location.origin).href }); return true; }
      catch (cause) { if (cause instanceof Error && cause.name === 'AbortError') return false; throw cause; }
    }, shared => { if (shared) action.setMessage('Convite compartilhado.'); });
  }
  return <div className={styles.credentials}>
    {credential.code && <InvitationCodeDisplay code={credential.code} />}
    {showCodeField && <Input ref={codeField} label="Código para copiar" value={displayInvitationCode(credential.code)} readOnly onFocus={event => event.target.select()} />}
    <Input ref={linkField} label="Link do convite" value={credential.url} readOnly onFocus={event => event.target.select()} />
    <div className="stores-actions">{credential.code && <Button variant="secondary" disabled={action.busy} onClick={() => copy('code')}>Copiar código</Button>}
      <Button variant="secondary" disabled={action.busy} onClick={() => copy('url')}>Copiar link</Button>
      <Button variant="secondary" disabled={action.busy} onClick={share}>Compartilhar convite</Button></div>
    <Feedback {...action} />
  </div>;
}

export function InvitationCodeCard({ invitation, storeId, storeName, timezone, onUpdate }: {
  invitation: ManagedInvitation; storeId: string; storeName: string | null; timezone: string; onUpdate: () => void;
}) {
  const action = useStoreAction();
  const [credential, setCredential] = useState<InvitationCredential | null>(null);
  const credentialId = useId();
  const [uncertain, setUncertain] = useState(false);
  const codeInvitation = 'kind' in invitation;
  const status = invitationStatus(invitation);
  function reveal() {
    void action.run(signal => storeRequest<InvitationCredential>(`/api/lojas/${storeId}/convites/${invitation.id}/credencial`, 'GET', undefined, signal),
      value => { setCredential(value); action.setMessage('Código revelado. Escolha como compartilhar.'); });
  }
  function revoke(close: () => void) {
    void action.run(async signal => {
      try { return await storeRequest<ManagedInvitation>(`/api/lojas/${storeId}/convites/${invitation.id}/revogar`, 'POST', {}, signal); }
      catch (cause) { if (!signal.aborted && (!(cause instanceof StoreRequestError) || cause.status >= 500)) setUncertain(true); throw cause; }
    }, () => { setCredential(null); close(); onUpdate(); });
  }
  const revocable = !invitation.revokedAt && (codeInvitation || status === 'Pendente');
  return <article className={`stores-card ${styles.invitationCard}`}><div className={styles.cardHeader}><h3>Convite {invitation.id.slice(0, 8)}</h3>
    <StatusBadge tone={status === 'Disponível' || status === 'Aceito' ? 'success' : status === 'Pendente' || status === 'Pausado' ? 'pending' : 'info'} text={status} /></div>
    {codeInvitation ? <InvitationPolicyDetails invitation={invitation} timezone={timezone} /> :
      <p>Validade: <time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleString('pt-BR', { timeZone: timezone })}</time> · {timezone}</p>}
    {codeInvitation && <p className={`stores-muted ${styles.policyHint}`}>Prazo e limite permanecem os mesmos. Para mudá-los, revogue e gere outro convite.</p>}
    <Feedback {...action} />
    {codeInvitation && <Button variant="secondary" aria-disabled={action.busy} aria-expanded={!!credential} aria-controls={credential ? credentialId : undefined}
      onClick={() => { if (action.busy) return; if (credential) setCredential(null); else reveal(); }}>{credential ? 'Ocultar código' : 'Revelar código'}</Button>}
    {credential && <div id={credentialId}><InvitationCredentialActions credential={credential} storeName={storeName} /></div>}
    {(revocable || action.error) && <div className={styles.revocation}>{revocable && <ConfirmAction label="Revogar convite" title="Revogar este convite?"
      description={codeInvitation ? 'Este código e seu link deixam de aceitar novas entradas. Quem já participa continua na lojinha.' :
        'Quem receber este link não poderá mais usá-lo para entrar na loja. Você pode gerar outro convite.'}
      confirmLabel="Confirmar revogação" busy={action.busy} error={action.error} confirmDisabled={uncertain} onConfirm={revoke}>
      {uncertain && <Button variant="secondary" onClick={onUpdate}>Consultar estado do convite</Button>}
    </ConfirmAction>}
    {action.error && <Button variant="secondary" onClick={onUpdate}>Consultar estado do convite</Button>}</div>}
  </article>;
}
