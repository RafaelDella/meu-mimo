'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ResolvedCodeInvitation } from '@/contracts/invitations';
import type { InvitationResult, ProfileView, StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { InvitationCodeDisplay } from './invitation-code-display';
import { Feedback } from './store-controls';
import { StoreRequestError, storeError, storeRequest, useResource } from './store-api';

type JoinState = { busy: boolean; error: string; mode: 'JOIN' | 'CHECK' | 'UNAVAILABLE' };
const unavailable = {
  PENDING: 'Este convite não permite uma nova participação agora.',
  EXPIRED: 'Este convite expirou. Peça um novo código a quem convidou você.',
  REVOKED: 'Este convite foi revogado. Peça um novo código a quem convidou você.',
  EXHAUSTED: 'Este convite atingiu o limite de usos. Peça um novo código a quem convidou você.',
  PAUSED: 'Esta loja está pausada e não recebe novas participações agora.',
  CLOSED: 'Esta loja foi encerrada e não recebe novas participações.',
};

export function InvitationJoinDialog({ invitation, code, returnFocusRef, onDismiss, onJoined }: {
  invitation: ResolvedCodeInvitation; code: string; returnFocusRef: RefObject<HTMLElement | null>;
  onDismiss(): void; onJoined(value: InvitationResult): void;
}) {
  const profile = useResource<ProfileView>('/api/perfil');
  const active = useRef<AbortController | null>(null);
  const [join, setJoin] = useState<JoinState>({ busy: false, error: '', mode: 'JOIN' });
  useEffect(() => () => active.current?.abort(), []);

  function lostSession(cause: unknown) {
    if (!(cause instanceof StoreRequestError) || ![401, 403].includes(cause.status)) return false;
    onDismiss();
    window.dispatchEvent(new Event('meumimo:session-changed'));
    return true;
  }
  async function check(signal: AbortSignal, message: string) {
    try {
      const current = await storeRequest<StoreView>(`/api/lojas/${invitation.store.id}`, 'GET', undefined, signal);
      if (!signal.aborted) onJoined({ storeId: current.id, membershipId: current.membershipId, role: current.role });
    } catch (cause) {
      if (signal.aborted || lostSession(cause)) return;
      const absent = cause instanceof StoreRequestError && cause.status === 404;
      setJoin({ busy: false, mode: absent ? 'JOIN' : 'CHECK',
        error: absent ? message : 'O resultado ainda não foi confirmado. Confira sua participação antes de tentar novamente.' });
    }
  }
  async function run(checkOnly = false) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setJoin(previous => ({ ...previous, busy: true, error: '' }));
    try {
      if (checkOnly) await check(controller.signal, 'Sua participação ainda não foi encontrada. Você pode confirmar o convite novamente.');
      else {
        const result = await storeRequest<InvitationResult>('/api/convites/aceitar-codigo', 'POST', { code }, controller.signal, { notifyChange: false });
        if (!controller.signal.aborted) onJoined(result);
      }
    } catch (cause) {
      if (controller.signal.aborted || lostSession(cause)) return;
      if (!(cause instanceof StoreRequestError) || cause.status >= 500) await check(controller.signal, storeError(cause));
      else setJoin({ busy: false, mode: [404, 409, 410].includes(cause.status) ? 'UNAVAILABLE' : 'JOIN',
        error: storeError(cause) + (cause.status === 429 && cause.retryAfter ? ` Aguarde ${cause.retryAfter} segundos.` : '') });
    } finally {
      if (!controller.signal.aborted) {
        active.current = null;
        setJoin(previous => ({ ...previous, busy: false }));
      }
    }
  }
  const action = invitation.viewerAction;
  const existing = ['OPEN', 'MANAGE', 'HISTORY'].includes(action);
  return <Dialog open onOpenChange={open => { if (!open) onDismiss(); }} title="Quer fazer parte desta lojinha?"
    returnFocusRef={returnFocusRef}>
    <h3>{invitation.store.name || 'Uma lojinha de mimos'}</h3>
    <p>{invitation.store.presentation}</p><p>{invitation.inviter.displayName || 'Uma pessoa especial'} convidou você.</p>
    <InvitationCodeDisplay code={code} />
    {profile.loading ? <p role="status">Conferindo a conta conectada…</p> : profile.data ? <>
      <p>Você está na conta de <strong>{profile.data.displayName || 'Conta sem nome'}</strong>.</p>
      <Input label="Conta que aceita o convite" type="email" value={profile.data.email} readOnly />
    </> : <p role="alert">Não foi possível conferir sua conta. Feche este convite e confira “Minha conta” antes de aceitar.</p>}
    <p>Seus dados nesta lojinha ficam entre você e quem gerencia. Buscar ou fechar este convite não consome um uso.</p>
    {action === 'HISTORY' && <p>Sua participação está encerrada. O convite não reativa esse vínculo; seu histórico continua acessível.</p>}
    {action === 'UNAVAILABLE' && <p>{unavailable[invitation.status]}</p>}
    <Feedback busy={join.busy} error={join.error} />
    <div className="stores-actions"><Button variant="secondary" onClick={onDismiss}>Agora não</Button>
      {existing ? <Link className="primary-link" href={`/lojas/${invitation.store.id}`}>
        {action === 'MANAGE' ? 'Gerenciar lojinha' : action === 'HISTORY' ? 'Consultar histórico' : 'Abrir lojinha'}</Link> :
        action === 'JOIN' && join.mode !== 'UNAVAILABLE' ? <Button disabled={join.busy || profile.loading || !!profile.error}
          onClick={() => void run(join.mode === 'CHECK')}>{join.mode === 'CHECK' ? 'Conferir participação' : 'Participar da lojinha'}</Button> : null}
    </div>
  </Dialog>;
}
