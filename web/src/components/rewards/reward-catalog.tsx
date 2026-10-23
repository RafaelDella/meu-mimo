'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import type { RewardPage } from '@/contracts/rewards';
import type { StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/activities/activity-display';
import { storeError } from '@/components/stores/store-api';
import { useRewardResource } from './access';
import { RewardCard } from './reward-display';
import { apiBase, rewardPath } from './transport';
import { MimoEmpty, MimoIntro } from '@/components/ui/mimo-page';

export function RewardCatalog({ store, query: initialQuery = '', compact = false }: { store: StoreView; query?: string; compact?: boolean }) {
  const router = useRouter();
  const initial = new URLSearchParams(initialQuery);
  const [filters, setFilters] = useState({ q: initial.get('q') ?? '', category: initial.get('category') ?? '', state: initial.get('state') ?? 'ACTIVE' });
  const [queryError, setQueryError] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const merchant = store.role === 'MERCHANT';
  const query = new URLSearchParams(initialQuery); if (!query.has('state')) query.set('state', 'ACTIVE');
  if (compact) query.set('pageSize', '4');
  const { data, error, loading, denied, reload } = useRewardResource<RewardPage>(`${apiBase(store.id)}/mimos?${query}`);
  useEffect(() => { if (initialQuery) title.current?.focus(); }, [initialQuery]);
  function navigate(page: number, values = filters) {
    const params = new URLSearchParams(); for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    const pageSize = query.get('pageSize'); if (pageSize && !compact) params.set('pageSize', pageSize);
    params.set('page', String(page)); router.push(`${rewardPath(store.id)}?${params}`);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Array.from(filters.q.trim()).length > 80) { setQueryError('Use até 80 caracteres na busca.'); return; }
    setQueryError(''); navigate(1);
  }
  if (denied) return null;
  return <section><MimoIntro kind="gift"><h2 tabIndex={-1} ref={title}>{compact ? 'Mimos na sua vitrine' : merchant ? 'Catálogo de mimos' : 'Mimos para você'}</h2><p>Escolhidos com cuidado, feitos para dar sorrisos.</p></MimoIntro>
    {merchant && store.state !== 'CLOSED' && !compact && <Link className="primary-link" href={`${rewardPath(store.id)}/novo`}>Novo mimo</Link>}
    {!compact && <form className="stores-filters" onSubmit={submit}><Input label="Buscar mimo" type="search" value={filters.q} hint="Até 80 caracteres." error={queryError}
      onChange={event => { setFilters(current => ({ ...current, q: event.target.value })); setQueryError(''); }} />
      <label className="stores-field">Categoria do mimo<select className="ui-input" value={filters.category} onChange={event => setFilters(current => ({ ...current, category: event.target.value }))}>
        <option value="">Todas as categorias</option>{filters.category && !data?.categories.includes(filters.category) && <option value={filters.category}>{filters.category}</option>}
        {data?.categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
      {merchant && <label className="stores-field">Mostrar mimos<select className="ui-input" value={filters.state} onChange={event => setFilters(current => ({ ...current, state: event.target.value }))}>
        <option value="ACTIVE">Não arquivados</option><option value="ARCHIVED">Arquivados</option><option value="ALL">Todos</option></select></label>}
      <Button type="submit">Filtrar mimos</Button></form>}
    {loading && <p role="status">Consultando mimos…</p>}{error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Consultar catálogo novamente</Button></div> : null}
    {data && <>{!data.items.length && <MimoEmpty kind="gift"><p>Nenhum mimo encontrado. {merchant ? 'Prepare um mimo para a sua loja.' : 'Os mimos preparados pela loja aparecerão aqui.'}</p></MimoEmpty>}
      <div className="stores-grid">{data.items.map(reward => <RewardCard key={reward.id} reward={reward} merchant={merchant} />)}</div>
      {!compact && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={page => navigate(page, { q: query.get('q') ?? '', category: query.get('category') ?? '', state: query.get('state') ?? 'ACTIVE' })} />}</>}
    {compact && <Link className="primary-link" href={rewardPath(store.id)}>Ver todos os mimos</Link>}
  </section>;
}
