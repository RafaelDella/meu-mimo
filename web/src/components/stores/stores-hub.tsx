'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AccountSession } from '@/app/conta/account-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrivateArea } from './private-area';
import { Pagination } from './store-controls';
import { storeError } from './store-api';
import { useStoreSearch } from './use-store-search';
import { InvitationJoinDialog } from './invitation-join-dialog';
import { MimoEmpty, MimoIntro, MimoMasthead } from '@/components/ui/mimo-page';
import { MimoIcon } from '@/components/ui/mimo-icon';

function StoreList({ session }: { session: AccountSession }) {
  const router = useRouter();
  const field = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const search = useStoreSearch(`${session.userId}:${session.sessionId}`);
  const { data, error, loading, reload, input, setPage } = search;
  const role = input.role;
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); search.submit(draft); }
  return <>
    <div className="stores-intro"><p>Seu carinho tem um cantinho em cada loja. Escolha onde quer entrar.</p>
      <Link className="primary-link" href="/lojas/nova">Criar lojinha</Link></div>
    <div className="stores-actions" role="group" aria-label="Lojas por papel">
      <Button variant={role === 'PARTICIPANT' ? 'primary' : 'secondary'} aria-pressed={role === 'PARTICIPANT'} onClick={() => search.filter({ role: 'PARTICIPANT' })}>Lojas que participo</Button>
      <Button variant={role === 'MERCHANT' ? 'primary' : 'secondary'} aria-pressed={role === 'MERCHANT'} onClick={() => search.filter({ role: 'MERCHANT' })}>Lojas que criei</Button>
    </div>
    <form className="stores-filters" onSubmit={submit}>
      <Input ref={field} label="Buscar loja ou código" hint="Digite o nome da loja ou cole o código de convite e toque em Buscar."
        value={draft} maxLength={80} onChange={event => setDraft(event.target.value)} type="search" autoComplete="off" />
      <label className="stores-field">Mostrar lojas<select className="ui-input" value={input.state ?? ''} onChange={event => {
        search.filter({ state: (event.target.value || undefined) as typeof input.state });
      }}>
        <option value="">Ativas e pausadas</option><option value="ALL">Todas, incluindo encerradas</option><option value="ACTIVE">Ativas</option>
        <option value="PAUSED">Pausadas</option><option value="CLOSED">Encerradas</option>
      </select></label><Button type="submit">Buscar</Button>
    </form>
    <section aria-label="Suas lojas" aria-busy={loading}>
      {loading && <p role="status">Buscando suas lojas…</p>}
      {error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Tentar novamente</Button></div> : null}
      {data && <>
        {!data.items.length && <MimoEmpty kind="envelope"><h2>Nenhuma loja por aqui ainda</h2><p>{input.q ? 'Confira o nome ou código recebido. Você também pode alterar os filtros.' : role === 'MERCHANT' ? 'Crie sua primeira lojinha para começar.' : 'Digite o código ou abra o link de convite que você recebeu. Você também pode criar sua lojinha.'}</p></MimoEmpty>}
        <div className="stores-grid">{data.items.map(store => <article className="stores-card" key={store.id}>
          <span className="stores-mark" aria-hidden="true"><MimoIcon name="bow" /></span><h2>{store.name || 'Sua lojinha'}</h2>
          <p>{store.presentation || 'Um cantinho de pequenos gestos.'}</p>
          <p className="stores-state">{store.membershipClosedAt ? 'Participação encerrada' : store.state === 'CLOSED' ? 'Loja encerrada' : store.state === 'PAUSED' ? 'Loja pausada' : role === 'MERCHANT' ? 'Gerenciando' : 'Participando'}</p>
          {store.platformPausedAt && <p className="stores-state">Novas ações pausadas pela plataforma</p>}
          <Link className="stores-link" href={`/lojas/${store.id}`}>{store.membershipClosedAt || store.state === 'CLOSED' ? 'Consultar loja' : role === 'MERCHANT' ? 'Gerenciar loja' : 'Entrar na loja'}</Link>
        </article>)}</div>
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} busy={loading} />
      </>}
    </section>
    {search.invitation && search.code && <InvitationJoinDialog key={search.requestKey} invitation={search.invitation}
      code={search.code} returnFocusRef={field} onDismiss={search.dismiss} onJoined={result => {
        search.dismiss();
        window.dispatchEvent(new Event('meumimo:relationship-changed'));
        router.push(`/lojas/${result.storeId}`);
      }} />}
  </>;
}

export function StoresHub() {
  return <main className="stores-shell"><MimoMasthead /><header className="stores-page-header">
    <Link className="stores-link" href="/conta">Minha conta</Link><MimoIntro kind="gift"><h1>Minhas lojas</h1><p>Um cantinho para cada carinho.</p></MimoIntro>
  </header><PrivateArea>{session => <StoreList key={`${session.userId}:${session.sessionId}`} session={session} />}</PrivateArea></main>;
}
