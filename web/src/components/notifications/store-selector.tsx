'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { PageResult, StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { useRelationshipResource } from './use-relationship-resource';
import styles from './relationship.module.css';

export function StoreSelector({ label, emptyLabel, value, onChange }: { label: string; emptyLabel: string; value: string; onChange(value: string): void }) {
  const id = useId(); const [draft, setDraft] = useState(''); const [query, setQuery] = useState(''); const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<StoreView>();
  const select = useRef<HTMLSelectElement>(null); const focusAfterPage = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null); const [searchError, setSearchError] = useState('');
  const count = Array.from(draft.trim()).length;
  const params = new URLSearchParams({ q: query, page: String(page), pageSize: '20' });
  const resource = useRelationshipResource<PageResult<StoreView>>(`/api/lojas?${params}`);
  useEffect(() => {
    if (!resource.data || !focusAfterPage.current) return;
    focusAfterPage.current = false; select.current?.focus();
  }, [resource.data]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (count > 80) { setSearchError('Use até 80 caracteres Unicode para buscar uma loja.'); searchInput.current?.focus(); return; }
    setSearchError(''); setQuery(draft.trim()); setPage(1);
  }
  function name(store: StoreView) { return `${store.name || 'Sua lojinha'} · ${store.role === 'MERCHANT' ? 'Gerenciando' : 'Participando'}`; }
  return <section className={styles.stack} aria-label={`Selecionar ${label.toLowerCase()}`}>
    <form className={styles.actions} onSubmit={search}><label className={styles.field} htmlFor={`${id}-search`}>Buscar loja para selecionar<input id={`${id}-search`} ref={searchInput} className="ui-input" type="search" value={draft} aria-invalid={count > 80 || undefined} aria-describedby={`${id}-count`} onChange={event => setDraft(event.target.value)} /></label>
      <Button variant="secondary" type="submit">Buscar lojas</Button></form>
    <p id={`${id}-count`} className={count > 80 ? styles.error : styles.muted}>{count} de 80 caracteres Unicode na busca.</p><p role="alert">{searchError}</p>
    <label className={styles.field} htmlFor={`${id}-selection`}>{label}<select id={`${id}-selection`} ref={select} className="ui-input" value={value} onChange={event => {
      const next = event.target.value; setSelection(resource.data?.items.find(store => store.id === next)); onChange(next);
    }}><option value="">{emptyLabel}</option>
      {value && !resource.data?.items.some(store => store.id === value) && <option value={value}>{selection?.id === value ? name(selection) : 'Loja selecionada'}</option>}
      {resource.data?.items.map(store => <option key={store.id} value={store.id}>{name(store)}</option>)}</select></label>
    {resource.loading && <p role="status">Buscando suas lojas…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>O seletor de lojas está indisponível agora.</p><Button variant="secondary" onClick={resource.reload}>Consultar lojas para selecionar novamente</Button></div> : null}
    {resource.data && !resource.data.items.length && <p>Nenhuma loja encontrada nesta busca.</p>}
    {resource.data && resource.data.total > resource.data.pageSize && <nav className={styles.actions} aria-label="Páginas de lojas">
      <Button variant="secondary" disabled={page <= 1} onClick={() => { focusAfterPage.current = true; setPage(value => value - 1); }}>Lojas anteriores</Button><span>Página de lojas {page} de {Math.ceil(resource.data.total / resource.data.pageSize)}</span>
      <Button variant="secondary" disabled={page * resource.data.pageSize >= resource.data.total} onClick={() => { focusAfterPage.current = true; setPage(value => value + 1); }}>Próximas lojas</Button></nav>}
  </section>;
}
