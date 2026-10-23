'use client';

import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import type { FeedPage } from '@/contracts/feed';
import type { StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/stores/store-controls';
import { storeError } from '@/components/stores/store-api';
import { useRelationshipResource } from '@/components/notifications/use-relationship-resource';
import { FeedCard } from './feed-card';
import { PersonFilter } from './person-filter';
import styles from '@/components/notifications/relationship.module.css';

const submissionStates = [['PENDING', 'Em análise'], ['APPROVED', 'Aprovada'], ['CONTESTED', 'Contestada'], ['VOIDED', 'Anulada']];
const ticketStates = [['WAITING_AGREEMENT', 'A combinar'], ['AGREED', 'Combinado'], ['CANCELLATION_REQUESTED', 'Cancelamento solicitado'], ['FULFILLED', 'Realizado'], ['CANCELLED', 'Cancelado']];
export function FeedArea({ store, accountKey, membershipId }: { store: StoreView; accountKey: string; membershipId?: string }) {
  const initial = useSearchParams();
  const type = initial.get('type') ?? ''; const status = initial.get('status') ?? ''; const person = membershipId ?? initial.get('participantMembershipId') ?? '';
  const period = { from: initial.get('from') ?? '', to: initial.get('to') ?? '' }; const periodKey = `${period.from}:${period.to}`;
  const [draftState, setDraftState] = useState({ key: periodKey, value: period });
  if (draftState.key !== periodKey) setDraftState({ key: periodKey, value: period });
  const draft = draftState.key === periodKey ? draftState.value : period;
  const page = Number(initial.get('page')) || 1; const pageSize = initial.get('pageSize') === '50' ? '50' : '20';
  const [invalidRange, setInvalidRange] = useState(false); const endDate = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const params = new URLSearchParams({ page: String(page), pageSize, ...(type ? { type } : {}), ...(status ? { status } : {}),
    ...(store.role === 'MERCHANT' && person ? { participantMembershipId: person } : {}), ...(period.from ? { from: period.from } : {}), ...(period.to ? { to: period.to } : {}) });
  const resource = useRelationshipResource<FeedPage>(`/api/lojas/${store.id}/mural?${params}`);
  const returnTo = `/lojas/${store.id}/mural?${params}`;
  function navigate(patch: Record<string, string>) {
    const next = new URLSearchParams(params); for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key); }
    const url = `/lojas/${store.id}/mural?${next}`;
    if (`${window.location.pathname}${window.location.search}` === url) void resource.reload(); else window.history.pushState(null, '', url);
  }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) { setInvalidRange(true); endDate.current?.focus(); return; }
    setInvalidRange(false); navigate({ ...draft, page: '1' });
  }
  return <section className={styles.stack} aria-labelledby="feed-title"><h2 id="feed-title" tabIndex={-1} ref={title}>Mural da relação</h2>
    <p>{store.role === 'PARTICIPANT' ? 'Só você e quem cuida desta lojinha veem este mural.' : 'Cada item continua privado entre você e a pessoa da relação.'}</p>
    <form className={styles.filters} onSubmit={search}><label className={styles.field}>Tipo<select className="ui-input" value={type} onChange={event => navigate({ type: event.target.value, status: '', page: '1' })}>
      <option value="">Todos os tipos</option><option value="SUBMISSION">Conquistas</option><option value="TICKET">Mimos resgatados</option></select></label>
      <label className={styles.field}>Estado<select className="ui-input" value={status} onChange={event => navigate({ status: event.target.value, page: '1' })}><option value="">Todos os estados</option>
        {(type === 'SUBMISSION' ? submissionStates : type === 'TICKET' ? ticketStates : [...submissionStates, ...ticketStates]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {store.role === 'MERCHANT' && !membershipId && <PersonFilter storeId={store.id} value={person} onChange={value => navigate({ participantMembershipId: value, page: '1' })} />}
      <label className={styles.field}>De<input className="ui-input" type="date" value={draft.from} onChange={event => setDraftState({ key: periodKey, value: { ...draft, from: event.target.value } })} /></label>
      <label className={styles.field}>Até<input ref={endDate} className="ui-input" type="date" aria-invalid={invalidRange || undefined} value={draft.to} onChange={event => setDraftState({ key: periodKey, value: { ...draft, to: event.target.value } })} /></label><Button type="submit">Aplicar período</Button>
      {invalidRange && <p role="alert">A data final precisa ser igual ou posterior à inicial.</p>}</form>
    <label className={styles.field}>Itens por página<select className="ui-input" value={pageSize} onChange={event => navigate({ pageSize: event.target.value, page: '1' })}><option value="20">20</option><option value="50">50</option></select></label>
    {resource.loading && <p role="status">Consultando o mural privado…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar mural novamente</Button></div> : null}
    {resource.data && <>{!resource.data.items.length && <p>Ainda não há momentos neste filtro. Conquistas recebidas e mimos resgatados aparecem aqui.</p>}
      {resource.data.items.map(item => <FeedCard key={item.id} item={item} accountKey={accountKey} merchant={store.role === 'MERCHANT'} returnTo={returnTo} />)}
      <Pagination {...resource.data} onPage={next => { navigate({ page: String(next) }); title.current?.focus(); }} /></>}
  </section>;
}
