'use client';

import { useState } from 'react';
import type { PageResult, PersonView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/activities/activity-display';
import { storeError } from '@/components/stores/store-api';
import { useRewardResource } from '@/components/rewards/access';
import { apiBase } from '@/components/rewards/transport';

export function TicketPeople({ storeId, value, onChange }: { storeId: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('Participação selecionada');
  const query = new URLSearchParams({ q, state: 'ALL', page: String(page), pageSize: '20' });
  const { data, error, loading, denied, reload } = useRewardResource<PageResult<PersonView>>(`${apiBase(storeId)}/participacoes?${query}`);
  if (denied) return null;
  const people = data?.items.filter(item => item.role === 'PARTICIPANT') ?? [];
  return <fieldset><legend>Pessoa participante</legend><Input label="Buscar pessoa nos resgates" type="search" value={draft} maxLength={80} onChange={event => setDraft(event.target.value)} />
    <Button variant="secondary" onClick={() => { setQ(draft.trim()); setPage(1); }}>Buscar pessoas nos resgates</Button>
    {loading && <p role="status">Buscando pessoas…</p>}{error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Consultar pessoas novamente</Button></div> : null}
    <label className="stores-field">Pessoa dos resgates<select className="ui-input" value={value} onChange={event => {
      setSelected(people.find(person => person.id === event.target.value)?.profile.displayName || 'Pessoa participante'); onChange(event.target.value);
    }}><option value="">Todas as pessoas</option>{value && !people.some(person => person.id === value) && <option value={value}>{selected}</option>}
      {people.map(person => <option key={person.id} value={person.id}>{person.profile.displayName || 'Pessoa participante'}</option>)}</select></label>
    {data && data.total > data.pageSize && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
  </fieldset>;
}
