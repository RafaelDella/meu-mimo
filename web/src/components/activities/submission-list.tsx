'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ActivityView, SubmissionPage } from '@/contracts/activities';
import type { PageResult, PersonView, StoreView } from '@/contracts/stores';
import { useResource, storeError } from '@/components/stores/store-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination, SubmissionCard } from './activity-display';
import { base } from './transport';

function ResourceFilter({ storeId, people = false, onChange }: { storeId: string; people?: boolean; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState({ value: '', label: '' });
  const query = new URLSearchParams({ q, state: 'ALL', page: String(page), pageSize: '20' });
  const { data, loading, error, reload } = useResource<PageResult<ActivityView | PersonView>>(`${base(storeId)}/${people ? 'participacoes' : 'atividades'}?${query}`);
  const options = data?.items.filter(item => !('role' in item) || item.role === 'PARTICIPANT').map(item => ({ value: item.id,
    label: 'profile' in item ? item.profile.displayName || 'Participante' : item.name })) ?? [];
  return <fieldset><legend>{people ? 'Filtrar por pessoa' : 'Filtrar por atividade'}</legend>
    <Input label={people ? 'Buscar pessoa para filtrar' : 'Buscar atividade para filtrar'} type="search" value={draft} maxLength={80} onChange={event => setDraft(event.target.value)} />
    <Button variant="secondary" onClick={() => { setQ(draft.trim()); setPage(1); reload(); }}>{people ? 'Buscar pessoas' : 'Buscar opções de atividade'}</Button>
    {loading && <p role="status">Buscando opções…</p>}{error ? <p role="alert">{storeError(error)}</p> : null}
    <label className="stores-field">{people ? 'Pessoa' : 'Atividade'}<select className="ui-input" value={selected.value} onChange={event => {
      const value = event.target.value; setSelected(options.find(option => option.value === value) ?? { value: '', label: '' }); onChange(value);
    }}><option value="">{people ? 'Todas as pessoas' : 'Todas as atividades'}</option>
      {selected.value && !options.some(option => option.value === selected.value) && <option value={selected.value}>{selected.label}</option>}
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    {data && data.total > data.pageSize && <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
  </fieldset>;
}

export function SubmissionList({ store, activityId, compact = false }: { store: StoreView; activityId?: string; compact?: boolean }) {
  const title = useRef<HTMLHeadingElement>(null);
  const focusAfterLoad = useRef(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ activityId: activityId ?? '', membershipId: '', status: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const [invalidRange, setInvalidRange] = useState(false);
  const query = new URLSearchParams({ page: String(page), pageSize: compact ? '5' : '20' });
  for (const [key, value] of Object.entries(applied)) if (value) query.set(key, value);
  const { data, error, loading, reload } = useResource<SubmissionPage>(`${base(store.id)}/registros?${query}`);
  useEffect(() => {
    if (!loading && focusAfterLoad.current) { focusAfterLoad.current = false; title.current?.focus(); }
  }, [loading]);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filters.from && filters.to && filters.from > filters.to) { setInvalidRange(true); return; }
    setInvalidRange(false); focusAfterLoad.current = true; setApplied(filters); setPage(1); reload();
  }
  return <section aria-labelledby="records-title"><h3 id="records-title" ref={title} tabIndex={-1}>{compact ? 'Registros nesta atividade' : store.role === 'MERCHANT' ? 'Registros recebidos' : 'Meus registros'}</h3>
    {!compact && <form className="stores-form" onSubmit={filter}>
      {!activityId && <ResourceFilter storeId={store.id} onChange={value => setFilters(previous => ({ ...previous, activityId: value }))} />}
      {store.role === 'MERCHANT' && <ResourceFilter storeId={store.id} people onChange={value => setFilters(previous => ({ ...previous, membershipId: value }))} />}
      <label className="stores-field">Situação<select className="ui-input" value={filters.status} onChange={event => setFilters(previous => ({ ...previous, status: event.target.value }))}>
        <option value="">Todos os registros</option><option value="PENDING">Aguardando aprovação</option><option value="APPROVED">Aprovados</option>
        <option value="CONTESTED">Em contestação</option><option value="VOIDED">Anulados</option></select></label>
      <Input label="Desde a data" type="date" value={filters.from} onChange={event => setFilters(previous => ({ ...previous, from: event.target.value }))} />
      <Input label="Até a data" type="date" value={filters.to} onChange={event => setFilters(previous => ({ ...previous, to: event.target.value }))} />
      <p>As datas consideram o fuso da loja: {store.timezone}.</p>{invalidRange && <p role="alert">A data final precisa ser igual ou posterior à inicial.</p>}
      <Button type="submit">Aplicar filtros</Button>
    </form>}
    {loading && <p role="status">Consultando registros…</p>}
    {error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Tentar carregar novamente</Button></div> : null}
    {data && <>{!data.items.length && <p>{store.role === 'MERCHANT' ? 'Nenhum registro recebido com estes filtros.' : 'Nenhum registro encontrado. Suas conquistas enviadas aparecerão aqui.'}</p>}
      <div className="stores-grid">{data.items.map(submission => <SubmissionCard key={submission.id} submission={submission} merchant={store.role === 'MERCHANT'} />)}</div>
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={next => { focusAfterLoad.current = true; setPage(next); }} /></>}
  </section>;
}
