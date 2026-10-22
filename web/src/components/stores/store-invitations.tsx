'use client';

import { useEffect, useRef, useState } from 'react';
import type { InvitationView, PageResult, StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmAction, Feedback, Pagination } from './store-controls';
import { StoreRequestError, storeError, storeRequest, useResource, useStoreAction } from './store-api';

type GeneratedInvitation = InvitationView & { url: string };
export function invitationStatus(invitation: InvitationView) {
  if (invitation.revokedAt) return 'Revogado';
  if (invitation.acceptedAt) return 'Aceito';
  return Date.parse(invitation.expiresAt) <= Date.now() ? 'Expirado' : 'Pendente';
}

function InvitationCard({ invitation, storeId, onUpdate }: { invitation: InvitationView; storeId: string; onUpdate: () => void }) {
  const action = useStoreAction();
  const [uncertain, setUncertain] = useState(false);
  const status = invitationStatus(invitation);
  function revoke(close: () => void) {
    void action.run(async signal => {
      try { return await storeRequest<InvitationView>(`/api/lojas/${storeId}/convites/${invitation.id}/revogar`, 'POST', {}, signal); }
      catch (cause) { if (!signal.aborted && (!(cause instanceof StoreRequestError) || cause.status >= 500)) setUncertain(true); throw cause; }
    },
      () => { close(); onUpdate(); });
  }
  return <article className="stores-card"><h3>Convite {invitation.id.slice(0, 8)}</h3><p className="stores-state">{status}</p>
    <p>Validade: <time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleString('pt-BR')}</time></p>
    <Feedback {...action} />{status === 'Pendente' && <ConfirmAction label="Revogar convite" title="Revogar este convite?"
      description="Quem receber este link não poderá mais usá-lo para entrar na loja. Você pode gerar outro convite."
      confirmLabel="Confirmar revogação" busy={action.busy} error={action.error} confirmDisabled={uncertain} onConfirm={revoke}>
      {uncertain && <Button variant="secondary" onClick={onUpdate}>Consultar estado do convite</Button>}
    </ConfirmAction>}
    {action.error && <Button variant="secondary" onClick={onUpdate}>Consultar estado do convite</Button>}
  </article>;
}

export function StoreInvitations({ store }: { store: StoreView }) {
  const title = useRef<HTMLHeadingElement>(null);
  const focusAfterRefresh = useRef(false);
  const [page, setPage] = useState(1);
  const path = `/api/lojas/${store.id}/convites`;
  const list = useResource<PageResult<InvitationView>>(`${path}?page=${page}&pageSize=20`);
  function refresh() { focusAfterRefresh.current = true; list.reload(); }
  useEffect(() => {
    if (list.loading || list.refreshing || !focusAfterRefresh.current) return;
    focusAfterRefresh.current = false; title.current?.focus();
  }, [list.loading, list.refreshing]);
  const action = useStoreAction();
  const pending = useRef<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [generated, setGenerated] = useState<GeneratedInvitation | null>(null);
  function generate() {
    pending.current ??= crypto.randomUUID();
    const operationId = pending.current;
    void action.run(async signal => {
      try { return await storeRequest<GeneratedInvitation>(path, 'POST', { operationId }, signal); }
      catch (cause) {
        if (signal.aborted) throw cause;
        if (!uncertain && cause instanceof StoreRequestError && cause.status === 400) { pending.current = null; setUncertain(false); }
        else setUncertain(true);
        throw cause;
      }
    }, value => { setGenerated(value); pending.current = null; setUncertain(false); action.setMessage('Convite gerado. Escolha como compartilhar o link.'); list.reload(); });
  }
  function copy() {
    if (!generated) return;
    void action.run(async () => {
      if (!navigator.clipboard) throw new StoreRequestError('clipboard_unavailable', 400, 'Selecione e copie o link no campo acima.');
      await navigator.clipboard.writeText(new URL(generated.url, window.location.origin).href);
    }, () => action.setMessage('Link copiado.'));
  }
  function share() {
    if (!generated) return;
    void action.run(async () => {
      if (!navigator.share) throw new StoreRequestError('share_unavailable', 400, 'O compartilhamento do dispositivo não está disponível. Copie o link para compartilhar.');
      try { await navigator.share({ title: `Convite para ${store.name || 'uma lojinha'}`, url: new URL(generated.url, window.location.origin).href }); return true; }
      catch (cause) { if (cause instanceof Error && cause.name === 'AbortError') return false; throw cause; }
    }, shared => { if (shared) action.setMessage('Convite compartilhado.'); });
  }
  return <section aria-labelledby="invitations-title"><h2 id="invitations-title" ref={title} tabIndex={-1}>Convites</h2>
    <div className="stores-card"><p>Cada link vale por sete dias e pode ser aceito uma vez. Compartilhe com a pessoa que você quer convidar.</p>
      <Feedback {...action} />{store.state === 'ACTIVE' ? <Button disabled={action.busy} onClick={generate}>{uncertain ? 'Recuperar convite' : 'Gerar convite'}</Button> : <p>Retome a loja para gerar convites. Lojas encerradas permanecem somente para consulta.</p>}
      {uncertain && <p>Use “Recuperar convite” para consultar a mesma solicitação e recuperar o link.</p>}
      {generated && <div className="stores-invitation-link"><Input label="Link do convite" value={generated.url} readOnly onFocus={event => event.target.select()} />
        <div className="stores-actions"><Button variant="secondary" disabled={action.busy} onClick={copy}>Copiar link</Button>
          <Button variant="secondary" disabled={action.busy} onClick={share}>Compartilhar convite</Button></div></div>}
    </div>
    <div aria-busy={list.loading}>{list.loading && <p role="status">Buscando convites…</p>}
      {list.error ? <div role="alert"><p>{storeError(list.error)}</p><Button variant="secondary" onClick={list.reload}>Tentar novamente</Button></div> : null}
      {list.data && <>{!list.data.items.length && <p>Nenhum convite foi gerado ainda.</p>}
        <div className="stores-grid">{list.data.items.map(invitation => <InvitationCard key={invitation.id} invitation={invitation} storeId={store.id} onUpdate={refresh} />)}</div>
        <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
      </>}
    </div>
  </section>;
}
