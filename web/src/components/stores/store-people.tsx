'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import type { PageResult, PersonView, StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmAction, Feedback, Pagination } from './store-controls';
import { storeError, storeRequest, useResource, useStoreAction } from './store-api';
import { StatusBadge } from '@/components/ui/status-badge';
import styles from './people.module.css';

function EndParticipation({ store, person, onUpdate }: { store: StoreView; person?: PersonView; onUpdate: () => void }) {
  const action = useStoreAction();
  const id = person?.id ?? store.membershipId;
  const ended = person ? person.closedAt : store.membershipClosedAt;
  function end(close: () => void) {
    void action.run(async signal => {
      try { return await storeRequest<PersonView>(`/api/lojas/${store.id}/participacoes/${id}/encerrar`, 'POST', {}, signal); }
      catch (cause) {
        if (signal.aborted) throw cause;
        const current = await storeRequest<PersonView>(`/api/lojas/${store.id}/participacoes/${id}`, 'GET', undefined, signal);
        if (current.closedAt) return current;
        throw cause;
      }
    }, () => { close(); onUpdate(); });
  }
  return <div className={styles.endAction}><Feedback {...action} />{ended ? <p className="stores-state">Participação encerrada. O histórico continua privado e acessível.</p> :
    <ConfirmAction label="Encerrar participação" title="Encerrar esta participação?" busy={action.busy}
      description="O encerramento é definitivo e interrompe novos ganhos e resgates nesta loja. Histórico, tickets existentes e conversa para resolver pendências permanecem acessíveis. Análises pendentes precisam ser resolvidas antes."
      confirmLabel="Confirmar encerramento" error={action.error} onConfirm={end} />}</div>;
}

function PeopleList({ store, onRefreshed }: { store: StoreView; onRefreshed: () => void }) {
  const focusAfterRefresh = useRef(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ q: query, state, page: String(page), pageSize: '20' });
  const { data, error, loading, refreshing, reload } = useResource<PageResult<PersonView>>(`/api/lojas/${store.id}/participacoes?${params}`, true);
  function refresh() { focusAfterRefresh.current = true; reload(); }
  useEffect(() => {
    if (loading || refreshing || !focusAfterRefresh.current) return;
    focusAfterRefresh.current = false; onRefreshed();
  }, [loading, refreshing, onRefreshed]);
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setQuery(draft.trim()); setPage(1); }
  return <>
    <form className={styles.filters} aria-label="Filtros de pessoas" onSubmit={search}><Input label="Buscar pessoa" name="q" autoComplete="off" value={draft} onChange={event => setDraft(event.target.value)} type="search" maxLength={80} />
      <label className="stores-field">Mostrar participações<select className="ui-input" name="state" value={state} onChange={event => { setState(event.target.value); setPage(1); }}>
        <option value="ALL">Todas</option><option value="ACTIVE">Ativas</option><option value="CLOSED">Encerradas</option>
      </select></label><Button type="submit">Buscar</Button></form>
    <div aria-busy={loading}>{loading && <p role="status">Buscando pessoas…</p>}
      {error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Tentar novamente</Button></div> : null}
      {data && <>{!data.items.length && <p>Nenhuma pessoa encontrada. Os participantes aparecem aqui depois de aceitar um convite.</p>}
        <div className={styles.list}>{data.items.map(person => <article className={`stores-card ${styles.personCard}`} key={person.id}>
          <div className={styles.identity}><h3>{person.profile.displayName || 'Pessoa participante'}</h3><p>{person.role === 'MERCHANT' ? 'Responsável pela loja' : 'Participante'}</p><StatusBadge tone={person.closedAt ? 'info' : 'success'} text={person.closedAt ? 'Encerrada' : 'Ativa'} /></div>
          {person.role === 'PARTICIPANT' && <Link className={`stores-link ${styles.open}`} href={`/lojas/${store.id}/pessoas/${person.id}`}>Abrir relação de {person.profile.displayName || 'pessoa participante'}</Link>}
          {person.role === 'PARTICIPANT' && <EndParticipation store={store} person={person} onUpdate={refresh} />}
        </article>)}</div>
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </>}
    </div>
  </>;
}

export function StorePeople({ store, onUpdate }: { store: StoreView; onUpdate: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  return <section className={styles.area} aria-labelledby="people-title"><h2 id="people-title" ref={title} tabIndex={-1}>{store.role === 'MERCHANT' ? 'Pessoas' : 'Minha participação'}</h2>
    {store.role === 'MERCHANT' ? <><p className={styles.intro}>Consulte cada relação, seus momentos e a situação da participação.</p><PeopleList store={store} onRefreshed={() => title.current?.focus()} /></> : <div className="stores-card"><p>Seu vínculo pertence somente a esta loja. Encerrar aqui não altera suas outras lojas.</p>
      <EndParticipation store={store} onUpdate={onUpdate} /></div>}
  </section>;
}
