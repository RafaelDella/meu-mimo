'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import type { TicketPage } from '@/contracts/redemptions';
import type { StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/activities/activity-display';
import { storeError } from '@/components/stores/store-api';
import { useRewardResource } from '@/components/rewards/access';
import { apiBase, ticketPath } from '@/components/rewards/transport';
import { TicketPeople } from './ticket-people';
import { TicketCard, ticketStatuses } from './ticket-display';
import { MimoEmpty } from '@/components/ui/mimo-page';

export function TicketList({ store, query: initialQuery }: { store: StoreView; query: string }) {
  const router = useRouter();
  const title = useRef<HTMLHeadingElement>(null);
  const initial = new URLSearchParams(initialQuery);
  const [filters, setFilters] = useState({ from: initial.get('from') ?? '', to: initial.get('to') ?? '', status: initial.get('status') ?? '', membershipId: initial.get('membershipId') ?? '' });
  const [invalid, setInvalid] = useState(false);
  const merchant = store.role === 'MERCHANT';
  const applied = new URLSearchParams(initialQuery);
  const { data, error, loading, denied, reload } = useRewardResource<TicketPage>(`${apiBase(store.id)}/tickets?${applied}`);
  const returnTo = `${ticketPath(store.id)}${initialQuery ? `?${initialQuery}` : ''}`;
  useEffect(() => { if (initialQuery) title.current?.focus(); }, [initialQuery]);
  function navigate(page: number, values = filters) {
    const query = new URLSearchParams(); for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
    const pageSize = applied.get('pageSize'); if (pageSize) query.set('pageSize', pageSize);
    query.set('page', String(page)); router.push(`${ticketPath(store.id)}?${query}`);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filters.from && filters.to && filters.from > filters.to) { setInvalid(true); return; }
    setInvalid(false); navigate(1);
  }
  if (denied) return null;
  return <section><h2 tabIndex={-1} ref={title}>{merchant ? 'Resgates da loja' : 'Meus tickets'}</h2><p>Datas inclusivas no fuso {store.timezone}.</p>
    <form className="stores-form" onSubmit={submit}>
      {merchant && <TicketPeople storeId={store.id} value={filters.membershipId} onChange={membershipId => setFilters(current => ({ ...current, membershipId }))} />}
      <Input label="Tickets desde a data" type="date" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} />
      <Input label="Tickets até a data" type="date" value={filters.to} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))} />
      <label className="stores-field">Estado do ticket<select className="ui-input" value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}>
        <option value="">Todos os estados</option>{Object.entries(ticketStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {invalid && <p role="alert">A data final precisa ser igual ou posterior à inicial.</p>}<Button type="submit">Filtrar tickets</Button></form>
    {loading && <p role="status">Consultando tickets…</p>}{error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Consultar tickets novamente</Button></div> : null}
    {data && <>{!data.items.length && <MimoEmpty kind="ticket"><p>Nenhum ticket encontrado com estes filtros.</p></MimoEmpty>}<div className="stores-grid">{data.items.map(ticket => <TicketCard key={ticket.id} ticket={ticket} merchant={merchant} returnTo={returnTo} />)}</div>
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={page => navigate(page, { from: applied.get('from') ?? '', to: applied.get('to') ?? '', status: applied.get('status') ?? '', membershipId: applied.get('membershipId') ?? '' })} /></>}
  </section>;
}
