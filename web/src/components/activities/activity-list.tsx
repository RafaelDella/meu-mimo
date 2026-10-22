'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ActivityPage, PointsBalance, PointsEntryView } from '@/contracts/activities';
import type { PageResult, StoreView } from '@/contracts/stores';
import { useResource, storeError } from '@/components/stores/store-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PointsSummary } from '@/components/ui/points-summary';
import { ActivityCard, Pagination, localTime, points } from './activity-display';
import { SubmissionList } from './submission-list';
import { activityPath, base, privacyError } from './transport';
import styles from './activities.module.css';

function ActivityCatalog({ store }: { store: StoreView }) {
  const merchant = store.role === 'MERCHANT';
  const title = useRef<HTMLHeadingElement>(null);
  const focusAfterLoad = useRef(false);
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [state, setState] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ q, state, page: String(page) });
  const { data, error, loading, reload } = useResource<ActivityPage>(`${base(store.id)}/atividades?${query}`);
  useEffect(() => {
    if (!loading && focusAfterLoad.current) { focusAfterLoad.current = false; title.current?.focus(); }
  }, [loading]);
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); focusAfterLoad.current = true; setQ(draft.trim()); setPage(1); reload(); }
  return <section aria-labelledby="catalog-title"><h3 id="catalog-title" ref={title} tabIndex={-1}>{merchant ? 'Cadastros de atividades' : 'Atividades para registrar'}</h3>
    {merchant && store.state !== 'CLOSED' && <Link className="primary-link" href={`${activityPath(store.id)}/nova`}>Nova atividade</Link>}
    <form className="stores-filters" onSubmit={search}><Input label="Buscar atividade" type="search" maxLength={80} value={draft} onChange={event => setDraft(event.target.value)} />
      <label className="stores-field">Mostrar atividades<select className="ui-input" value={state} onChange={event => { focusAfterLoad.current = true; setState(event.target.value); setPage(1); }}>
        <option value="ACTIVE">Ativas</option><option value="ARCHIVED">Arquivadas</option><option value="ALL">Todas</option></select></label><Button type="submit">Buscar</Button></form>
    {loading && <p role="status">Buscando atividades…</p>}
    {error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Tentar carregar novamente</Button></div> : null}
    {data && <>{!data.items.length && <p>{merchant ? 'Nenhuma atividade encontrada. Você pode preparar a primeira conquista desta loja.' : 'Nenhuma atividade encontrada. Quando a loja preparar uma atividade, ela aparecerá aqui.'}</p>}
      <div className="stores-grid">{data.items.map(activity => <ActivityCard key={activity.id} activity={activity} merchant={merchant} />)}</div>
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={next => { focusAfterLoad.current = true; setPage(next); }} /></>}
  </section>;
}

export function ParticipantPoints({ store }: { store: StoreView }) {
  const [page, setPage] = useState(1);
  const balance = useResource<PointsBalance>(`${base(store.id)}/pontos`);
  const entries = useResource<PageResult<PointsEntryView>>(`${base(store.id)}/pontos/movimentos?page=${page}`);
  if (privacyError(balance.error) || privacyError(entries.error)) return <p role="alert">Seus pontos nesta loja não estão disponíveis para esta conta.</p>;
  return <section className={styles.summary} aria-label="Pontos e conquistas nesta loja">
    {balance.loading && <p role="status">Consultando seus pontos…</p>}
    {balance.error ? <div role="alert"><p>{storeError(balance.error)}</p><Button variant="secondary" onClick={balance.reload}>Consultar pontos novamente</Button></div> : null}
    {balance.data && <><PointsSummary storeName={store.name || 'Sua lojinha'} available={balance.data.available} pending={balance.data.pending} />
      <div className="stores-card"><h3>Hoje nesta loja</h3><p>{balance.data.today.localDate.split('-').reverse().join('/')} · {balance.data.today.timezone}</p>
        <dl><div><dt>Registros enviados</dt><dd>{balance.data.today.submitted}</dd></div><div><dt>Registros aprovados</dt><dd>{balance.data.today.approved}</dd></div>
          <div><dt>Pontos creditados</dt><dd>{points(balance.data.today.credited)}</dd></div></dl></div></>}
    <div className="stores-card"><h3>Créditos das suas conquistas</h3>{entries.loading && <p role="status">Consultando créditos…</p>}
      {entries.error ? <div role="alert"><p>{storeError(entries.error)}</p><Button variant="secondary" onClick={entries.reload}>Consultar créditos novamente</Button></div> : null}
      {entries.data && <>{!entries.data.items.length && <p>Seus créditos confirmados aparecerão aqui, com acesso à conquista de origem.</p>}
        <ol className={styles.movements}>{entries.data.items.map(entry => <li key={entry.id}><strong>+{points(entry.amount)} pontos · {entry.activityName}</strong>
          <p>{balance.data ? localTime(entry.createdAt, balance.data.today.timezone) : 'Crédito confirmado'}</p><Link className="stores-link" href={entry.path}>Abrir conquista de origem</Link></li>)}</ol>
        <Pagination page={entries.data.page} pageSize={entries.data.pageSize} total={entries.data.total} onPage={setPage} /></>}
    </div>
  </section>;
}

export function ActivityList({ store }: { store: StoreView }) {
  const [tab, setTab] = useState<'activities' | 'submissions'>('activities');
  const merchant = store.role === 'MERCHANT';
  return <><h2>Atividades</h2>{!merchant && <ParticipantPoints store={store} />}
    <div className={styles.tabs} role="group" aria-label="Mostrar atividades ou registros">
      <Button variant="secondary" aria-pressed={tab === 'activities'} onClick={() => setTab('activities')}>{merchant ? 'Cadastros' : 'A fazer'}</Button>
      <Button variant="secondary" aria-pressed={tab === 'submissions'} onClick={() => setTab('submissions')}>{merchant ? 'Registros' : 'Meus registros'}</Button></div>
    {tab === 'activities' ? <ActivityCatalog store={store} /> : <SubmissionList store={store} />}
  </>;
}
