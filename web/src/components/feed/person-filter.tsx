'use client';

import { useId, useRef, useState } from 'react';
import type { PageResult, PersonView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/stores/store-controls';
import { useRelationshipResource } from '@/components/notifications/use-relationship-resource';
import styles from '@/components/notifications/relationship.module.css';
import feedStyles from './feed.module.css';

export function PersonFilter({ storeId, value, onChange }: { storeId: string; value: string; onChange(value: string): void }) {
  const [draft, setDraft] = useState(''); const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [selectedLabel, setSelectedLabel] = useState('Pessoa selecionada');
  const id = useId(); const input = useRef<HTMLInputElement>(null); const [error, setError] = useState(''); const count = Array.from(draft.trim()).length;
  const params = new URLSearchParams({ state: 'ALL', page: String(page), pageSize: '20', q: query });
  const resource = useRelationshipResource<PageResult<PersonView>>(`/api/lojas/${storeId}/participacoes?${params}`);
  const people = resource.data?.items.filter(person => person.role === 'PARTICIPANT') ?? [];
  function search() {
    if (count > 80) { setError('Use até 80 caracteres Unicode para buscar uma pessoa.'); input.current?.focus(); return; }
    setError(''); setQuery(draft.trim()); setPage(1);
  }
  return <fieldset className={feedStyles.people}><legend>Filtrar pessoa do mural</legend><div className={feedStyles.personSearch}>
    <label className={styles.field}>Buscar pessoa no mural<input ref={input} className="ui-input" name="personSearch" type="search" autoComplete="off" value={draft} aria-invalid={count > 80 || undefined} aria-describedby={id} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); search(); } }} /></label>
    <p id={id} className={count > 80 ? styles.error : styles.muted}>{count} de 80 caracteres Unicode na busca.</p><p role="alert">{error}</p></div>
    <Button variant="secondary" aria-label="Buscar pessoas do mural" onClick={search}>Buscar pessoas</Button>
    <label className={styles.field}>Pessoa<select className="ui-input" name="participantMembershipId" value={value} onChange={event => {
      const id = event.target.value; setSelectedLabel(people.find(person => person.id === id)?.profile.displayName || 'Pessoa participante'); onChange(id);
    }}><option value="">Todas as pessoas</option>{value && !people.some(person => person.id === value) && <option value={value}>{selectedLabel}</option>}
      {people.map(person => <option key={person.id} value={person.id}>{person.profile.displayName || 'Pessoa participante'}</option>)}</select></label>
    {resource.error && !resource.denied ? <p role="alert">Não foi possível consultar o filtro de pessoas. <Button variant="secondary" onClick={resource.reload}>Consultar pessoas novamente</Button></p> : null}
    {resource.data && resource.data.total > resource.data.pageSize && <Pagination {...resource.data} onPage={setPage} />}
  </fieldset>;
}
