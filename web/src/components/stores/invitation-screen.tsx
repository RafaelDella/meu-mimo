'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notifySessionChanged } from '@/app/conta/account-api';
import type { AccountSession } from '@/app/conta/account-api';
import type { InvitationPreview, InvitationResult, ProfileView, StoreView } from '@/contracts/stores';
import type { CodeInvitationPreview } from '@/contracts/invitations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Feedback } from './store-controls';
import { StoreRequestError, storeError, storeRequest, useResource, useStoreAction } from './store-api';
import { useCurrentSession } from './use-current-session';
import { MimoIntro, MimoMasthead } from '@/components/ui/mimo-page';
import { MimoIcon } from '@/components/ui/mimo-icon';

type Preview = InvitationPreview | CodeInvitationPreview;
const explanations: Record<Preview['status'], string> = {
  PENDING: 'Aceite para entrar nesta lojinha e celebrar suas conquistas.',
  EXPIRED: 'Este convite expirou. Peça um novo link a quem convidou você.',
  REVOKED: 'Este convite foi revogado. Peça um novo link a quem convidou você.',
  ACCEPTED: 'Este convite já foi aceito. Se foi você, entre na mesma conta para abrir a loja.',
  PAUSED: 'Esta loja está pausada. O convite não pode ser aceito enquanto ela estiver assim.',
  CLOSED: 'Esta loja foi encerrada e não recebe novas participações.',
  EXHAUSTED: 'Este convite atingiu o limite de usos. Peça um novo convite a quem convidou você.',
};

function InvitationAccount({ token, preview, session }: { token: string; preview: Preview; session: AccountSession }) {
  const router = useRouter();
  const profile = useResource<ProfileView>('/api/perfil');
  const access = useResource<StoreView>(`/api/lojas/${preview.store.id}`);
  const action = useStoreAction();
  const destination = `/convites/${encodeURIComponent(token)}`;
  function accept() {
    void action.run(async signal => {
      try { return await storeRequest<InvitationResult>(`/api/convites/${encodeURIComponent(token)}/aceitar`, 'POST', {}, signal); }
      catch (cause) {
        if (signal.aborted || (cause instanceof StoreRequestError && cause.status < 500)) throw cause;
        try {
          const current = await storeRequest<StoreView>(`/api/lojas/${preview.store.id}`, 'GET', undefined, signal);
          return { storeId: current.id, membershipId: current.membershipId, role: current.role };
        } catch { throw cause; }
      }
    },
      result => { router.push(`/lojas/${result.storeId}`); });
  }
  function switchAccount() {
    void action.run(signal => storeRequest('/api/auth/logout', 'POST', {}, signal), () => {
      notifySessionChanged();
      router.replace(`/conta?returnTo=${encodeURIComponent(destination)}`);
    });
  }
  const existing = access.data;
  const canAccept = ['PENDING', 'ACCEPTED'].includes(preview.status) && !existing?.membershipClosedAt;
  return <div className="stores-invitation-account" aria-busy={action.busy}>
    <p>{profile.loading ? 'Conferindo a conta conectada…' : <>Você está na conta de <strong>{profile.data?.displayName || 'Conta sem nome'}</strong>.</>}</p>
    {profile.data && <Input label="Conta que aceita o convite" type="email" value={profile.data.email} readOnly />}
    {profile.error ? <p role="alert">Não foi possível consultar o nome da conta. Abra “Minha conta” para conferir antes de aceitar.</p> : null}
    <div className="stores-actions"><Link className="stores-link" href="/conta">Minha conta</Link>
      <Button variant="secondary" disabled={action.busy} onClick={switchAccount}>Trocar conta</Button></div>
    <Feedback {...action} />
    {session.recovery ? <p>Conclua a recuperação da senha em “Minha conta” antes de continuar.</p> : access.loading ? <p role="status">Conferindo sua participação…</p> :
      existing ? <>{existing.membershipClosedAt && <p>Sua participação está encerrada e não pode ser reativada por convite. O histórico continua acessível.</p>}
        <Link className="primary-link" href={`/lojas/${existing.id}`}>{existing.role === 'MERCHANT' ? 'Gerenciar loja' : 'Abrir loja'}</Link></> :
        canAccept && access.error instanceof StoreRequestError && access.error.status === 404 ? <Button disabled={action.busy || profile.loading || !!profile.error} onClick={accept}>{preview.status === 'ACCEPTED' ? 'Verificar meu acesso' : 'Aceitar convite'}</Button> : null}
    {!!access.error && !(access.error instanceof StoreRequestError && access.error.status === 404) && <><p role="alert">{storeError(access.error)}</p><Button variant="secondary" onClick={access.reload}>Conferir participação novamente</Button></>}
    <p><Link className="stores-link" href="/lojas">Minhas lojas</Link></p>
  </div>;
}

export function InvitationScreen({ token }: { token: string }) {
  const preview = useResource<Preview>(`/api/convites/${encodeURIComponent(token)}`);
  const session = useCurrentSession();
  const destination = `/convites/${encodeURIComponent(token)}`;
  const guest = session.error instanceof StoreRequestError && session.error.status === 401;
  return <main className="stores-shell stores-invitation"><MimoMasthead />
    <MimoIntro kind="envelope"><h1>Um convite para você</h1><p>Tem uma lojinha esperando pelo seu carinho.</p></MimoIntro>
    {preview.loading && <p role="status">Abrindo o convite…</p>}
    {preview.error ? <section className="stores-card"><h2>Convite indisponível</h2><p role="alert">{storeError(preview.error)}</p>
      <Button variant="secondary" onClick={preview.reload}>Consultar convite novamente</Button></section> : null}
    {preview.data && <section className="stores-card"><span className="stores-mark" aria-hidden="true"><MimoIcon name="bow" /></span><h2>{preview.data.store.name || 'Uma lojinha de mimos'}</h2>
      <p>{preview.data.inviter.displayName || 'Uma pessoa especial'} preparou esta lojinha.</p><p>{preview.data.store.presentation}</p>
      <p className="stores-banner">{explanations[preview.data.status]}</p>
      <p>Depois do aceite, suas conquistas, saldo e mimos ficam entre você e quem gerencia esta loja. Outras pessoas participantes não acessam os seus dados.</p>
      {session.loading || session.refreshing ? <p role="status">Conferindo sua conta…</p> : null}
      {session.loading ? null : session.data ? <div hidden={session.refreshing} inert={session.refreshing}>
        <InvitationAccount key={`${session.data.sessionId}:${token}`} token={token} preview={preview.data} session={session.data} /></div> : guest ?
          <Link className="primary-link" href={`/conta?returnTo=${encodeURIComponent(destination)}`}>Entrar ou criar conta</Link> :
          <><p role="alert">{storeError(session.error)}</p><Button variant="secondary" onClick={session.reload}>Conferir conta novamente</Button></>}
    </section>}
  </main>;
}
