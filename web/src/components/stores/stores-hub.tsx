'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { PageResult, StoreRole, StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrivateArea } from './private-area';
import { Pagination } from './store-controls';
import { storeError, useResource } from './store-api';

function StoreList() {
  const [role, setRole] = useState<StoreRole>('PARTICIPANT');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ role, q: query, page: String(page), pageSize: '20', ...(state ? { state } : {}) });
  const { data, error, loading, reload } = useResource<PageResult<StoreView>>(`/api/lojas?${params}`);
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setQuery(draft.trim()); setPage(1); }
  return <>
    <div className="stores-intro"><p>Seu carinho tem um cantinho em cada loja. Escolha onde quer entrar.</p>
      <Link className="primary-link" href="/lojas/nova">Criar lojinha</Link></div>
    <div className="stores-actions" role="group" aria-label="Lojas por papel">
      <Button variant={role === 'PARTICIPANT' ? 'primary' : 'secondary'} aria-pressed={role === 'PARTICIPANT'} onClick={() => { setRole('PARTICIPANT'); setPage(1); }}>Lojas que participo</Button>
      <Button variant={role === 'MERCHANT' ? 'primary' : 'secondary'} aria-pressed={role === 'MERCHANT'} onClick={() => { setRole('MERCHANT'); setPage(1); }}>Lojas que criei</Button>
    </div>
    <form className="stores-filters" onSubmit={search}>
      <Input label="Buscar loja" value={draft} maxLength={80} onChange={event => setDraft(event.target.value)} type="search" />
      <label className="stores-field">Mostrar lojas<select className="ui-input" value={state} onChange={event => { setState(event.target.value); setPage(1); }}>
        <option value="">Ativas e pausadas</option><option value="ALL">Todas, incluindo encerradas</option><option value="ACTIVE">Ativas</option>
        <option value="PAUSED">Pausadas</option><option value="CLOSED">Encerradas</option>
      </select></label><Button type="submit">Buscar</Button>
    </form>
    <section aria-label="Suas lojas" aria-busy={loading}>
      {loading && <p role="status">Buscando suas lojas…</p>}
      {error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Tentar novamente</Button></div> : null}
      {data && <>
        {!data.items.length && <div className="stores-card"><h2>Nenhuma loja por aqui ainda</h2><p>{query ? 'Tente outro nome ou altere os filtros.' : role === 'MERCHANT' ? 'Crie sua primeira lojinha para começar.' : 'Abra o link de convite que você recebeu. Você também pode criar sua lojinha.'}</p></div>}
        <div className="stores-grid">{data.items.map(store => <article className="stores-card" key={store.id}>
          <span className="stores-mark" aria-hidden="true">♡</span><h2>{store.name || 'Sua lojinha'}</h2>
          <p>{store.presentation || 'Um cantinho de pequenos gestos.'}</p>
          <p className="stores-state">{store.membershipClosedAt ? 'Participação encerrada' : store.state === 'CLOSED' ? 'Loja encerrada' : store.state === 'PAUSED' ? 'Loja pausada' : role === 'MERCHANT' ? 'Gerenciando' : 'Participando'}</p>
          <Link className="stores-link" href={`/lojas/${store.id}`}>{store.membershipClosedAt || store.state === 'CLOSED' ? 'Consultar loja' : role === 'MERCHANT' ? 'Gerenciar loja' : 'Entrar na loja'}</Link>
        </article>)}</div>
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </>}
    </section>
  </>;
}

export function StoresHub() {
  return <main className="stores-shell"><header className="stores-page-header">
    <Link className="stores-link" href="/">meu mimo<span className="brand-dot">.</span></Link>
    <Link className="stores-link" href="/conta">Minha conta</Link><h1>Minhas lojas</h1>
  </header><PrivateArea>{session => <StoreList key={session.sessionId} />}</PrivateArea></main>;
}
