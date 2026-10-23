'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { AdminListQuery, AdminPage } from '@/contracts/admin';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/stores/store-controls';
import { storeError } from '@/components/stores/store-api';
import { useAdminResource } from './transport';
import styles from './admin.module.css';

export function AdminQueryList<T>({ kind, children }: { kind: 'accounts' | 'stores'; children(value: T): ReactNode }) {
  const accounts = kind === 'accounts'; const [draft, setDraft] = useState(''); const [security, setSecurity] = useState(''); const [state, setState] = useState(''); const [platform, setPlatform] = useState('');
  const [query, setQuery] = useState<AdminListQuery>({ page: 1, pageSize: 20 }); const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null); const heading = useRef<HTMLHeadingElement>(null); const focusAfterPage = useRef(false);
  const resource = useAdminResource<AdminPage<T>>(`/api/admin/${accounts ? 'contas' : 'lojas'}/consulta`, query);
  useEffect(() => { if (!resource.loading && focusAfterPage.current) { focusAfterPage.current = false; heading.current?.focus(); } }, [resource.loading]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (Array.from(draft.trim()).length > 80) { setError('Use até 80 caracteres Unicode na busca.'); field.current?.focus(); return; }
    setError(''); setQuery({ page: 1, pageSize: query.pageSize, ...(draft.trim() ? { q: draft.trim() } : {}),
      ...(accounts && security ? { security: security as 'ACTIVE' | 'BLOCKED' } : {}),
      ...(!accounts && state ? { state: state as 'ACTIVE' | 'PAUSED' | 'CLOSED' } : {}), ...(!accounts && platform ? { platformPaused: platform === 'YES' } : {}) });
  }
  return <section className={styles.stack}><h2 ref={heading} tabIndex={-1}>{accounts ? 'Contas' : 'Lojas'}</h2>
    <form className={styles.filters} onSubmit={search}><label className={styles.field}>{accounts ? 'Buscar conta por nome ou UUID' : 'Buscar loja ou responsável por nome ou UUID'}<input className="ui-input" ref={field} type="search" value={draft} aria-invalid={Array.from(draft.trim()).length > 80 || undefined} onChange={event => setDraft(event.target.value)} /></label>
      {accounts ? <label className={styles.field}>Estado de segurança<select className="ui-input" value={security} onChange={event => setSecurity(event.target.value)}><option value="">Todas as contas</option><option value="ACTIVE">Acesso ativo</option><option value="BLOCKED">Bloqueadas</option></select></label> : <>
        <label className={styles.field}>Estado do lojista<select className="ui-input" value={state} onChange={event => setState(event.target.value)}><option value="">Todos os estados</option><option value="ACTIVE">Ativo</option><option value="PAUSED">Pausado</option><option value="CLOSED">Encerrado</option></select></label>
        <label className={styles.field}>Pausa da plataforma<select className="ui-input" value={platform} onChange={event => setPlatform(event.target.value)}><option value="">Todas as lojas</option><option value="YES">Com pausa da plataforma</option><option value="NO">Sem pausa da plataforma</option></select></label></>}
      <Button type="submit">{accounts ? 'Buscar contas' : 'Buscar lojas'}</Button></form><p role="alert">{error}</p>
    <label className={styles.field}>Resultados por página<select className="ui-input" value={query.pageSize} onChange={event => { focusAfterPage.current = true; setQuery({ ...query, page: 1, pageSize: Number(event.target.value) }); }}><option value="20">20</option><option value="50">50</option></select></label>
    <p className={styles.muted}>Filtros aplicados: {query.q || 'sem termo de busca'}{query.security ? ` · ${query.security === 'BLOCKED' ? 'bloqueadas' : 'acesso ativo'}` : ''}{query.state ? ` · estado do lojista ${query.state}` : ''}{query.platformPaused !== undefined ? ` · ${query.platformPaused ? 'com' : 'sem'} pausa da plataforma` : ''}.</p>
    {resource.loading && <p role="status">Consultando metadados…</p>}{resource.error ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar lista novamente</Button></div> : null}
    {resource.data && <>{!resource.data.items.length && <p>{accounts ? 'Nenhuma conta encontrada com estes filtros.' : 'Nenhuma loja encontrada com estes filtros.'}</p>}<div className={styles.grid}>{resource.data.items.map(children)}</div>
      <Pagination {...resource.data} onPage={page => { focusAfterPage.current = true; setQuery({ ...query, page }); }} /></>}
  </section>;
}
