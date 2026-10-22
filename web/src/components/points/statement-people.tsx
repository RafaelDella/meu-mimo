'use client';

import { useState } from 'react';
import type { PageResult, PersonView } from '@/contracts/stores';
import { useResource, storeError } from '@/components/stores/store-api';
import type { StoreRequestError } from '@/components/stores/store-api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/activities/activity-display';
import { useStatementAccess } from './use-statement-access';

export function StatementPeople({ storeId, value, onChange, onUnavailable }: {
  storeId: string; value: string; onChange: (value: string) => void; onUnavailable: (cause: StoreRequestError) => void;
}) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState({ value, label: 'Participação selecionada' });
  const query = new URLSearchParams({ q, state: 'ALL', page: String(page), pageSize: '20' });
  const { data, loading, error, reload } = useResource<PageResult<PersonView>>(`/api/lojas/${encodeURIComponent(storeId)}/participacoes?${query}`);
  const denied = useStatementAccess(error, onUnavailable);
  const items = data?.items.filter(person => person.role === 'PARTICIPANT') ?? [];
  if (denied) return null;
  return <fieldset><legend>Participação no extrato</legend>
    <Input label="Buscar pessoa no extrato" type="search" value={draft} maxLength={80} onChange={event => setDraft(event.target.value)} />
    <Button variant="secondary" onClick={() => { setQ(draft.trim()); setPage(1); }}>Buscar pessoas no extrato</Button>
    {loading && <p role="status">Buscando pessoas…</p>}{error ? <div role="alert"><p>{storeError(error)}</p>
      <Button variant="secondary" onClick={reload}>Tentar buscar pessoas novamente</Button></div> : null}
    <label className="stores-field">Pessoa do extrato<select className="ui-input" value={value} onChange={event => {
      const person = items.find(item => item.id === event.target.value);
      setSelected({ value: event.target.value, label: person?.profile.displayName || 'Pessoa participante' }); onChange(event.target.value);
    }}><option value="">Todas as pessoas</option>
      {value && !items.some(person => person.id === value) && <option value={value}>{selected.label}</option>}
      {items.map(person => <option key={person.id} value={person.id}>{person.profile.displayName || 'Pessoa participante'}</option>)}</select></label>
    {data && data.total > data.pageSize && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
  </fieldset>;
}
