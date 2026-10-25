'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NotificationCategory, NotificationGroupPage, NotificationGroupView, NotificationTarget } from '@/contracts/notifications';
import type { StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PrivateArea } from '@/components/stores/private-area';
import { Pagination } from '@/components/stores/store-controls';
import { StoreRequestError, storeError, storeRequest, useStoreAction } from '@/components/stores/store-api';
import { RewardAccess } from '@/components/rewards/access';
import { RelationshipRefresh, invalidateRelationship } from './relationship-refresh';
import { useRelationshipResource } from './use-relationship-resource';
import { categoryLabels } from './notification-labels';
import styles from './notification-center.module.css';
import { StoreSelector } from './store-selector';
import { MimoEmpty, MimoIntro, MimoMasthead } from '@/components/ui/mimo-page';
import { MimoIcon } from '@/components/ui/mimo-icon';
import { NotificationCard } from './notification-card';

function Center() {
  const [storeId, setStoreId] = useState(''); const [category, setCategory] = useState(''); const [page, setPage] = useState(1);
  const [filterRevision, setFilterRevision] = useState(0);
  const params = new URLSearchParams({ page: String(page), pageSize: '20', ...(storeId ? { storeId } : {}), ...(category ? { category } : {}) });
  const resource = useRelationshipResource<NotificationGroupPage>(`/api/notificacoes/grupos?${params}`);
  const attention = useRelationshipResource<NotificationGroupPage>('/api/notificacoes/grupos?page=1&pageSize=1');
  const action = useStoreAction(); const router = useRouter(); const trigger = useRef<HTMLButtonElement | null>(null);
  const title = useRef<HTMLHeadingElement>(null); const focusAfterPage = useRef(false);
  const [destination, setDestination] = useState<{ target: NotificationTarget; store: StoreView } | null>(null);
  useEffect(() => {
    if ((!resource.data && !resource.error) || !focusAfterPage.current) return;
    focusAfterPage.current = false; title.current?.focus();
  }, [resource.data, resource.error]);
  function failed(cause: unknown) {
    setDestination(null); void resource.reload();
    if (cause instanceof StoreRequestError && cause.status === 401) window.dispatchEvent(new Event('meumimo:session-changed'));
  }
  function read(group: NotificationGroupView, heading: HTMLHeadingElement | null, button: HTMLButtonElement) {
    void action.run(async signal => {
      try { return await storeRequest(`/api/notificacoes/grupos/${group.id}/lida`, 'POST', { throughVersion: group.version }, signal); }
      catch (cause) { failed(cause); throw cause; }
    }, () => { if (document.activeElement === button) heading?.focus(); void resource.reload(); invalidateRelationship(); });
  }
  function open(group: NotificationGroupView, button: HTMLButtonElement) {
    trigger.current = button; setDestination(null);
    void action.run(async signal => {
      try {
        const target = await storeRequest<NotificationTarget>(`/api/notificacoes/grupos/${group.id}/destino`, 'GET', undefined, signal);
        const store = await storeRequest<StoreView>(`/api/lojas/${target.storeId}`, 'GET', undefined, signal);
        return { target, store };
      } catch (cause) { failed(cause); throw cause; }
    }, value => setDestination(value));
  }
  function clearFilters() { setStoreId(''); setCategory(''); setPage(1); setFilterRevision(value => value + 1); }
  return <div className={styles.stack}><header className={styles.header}><nav className={styles.navigation} aria-label="Navegação das novidades"><Link href="/lojas"><MimoIcon name="home" />Minhas lojas</Link><Link href="/conta"><MimoIcon name="people" />Minha conta</Link></nav>
    <MimoIntro kind="envelope"><h1 ref={title} tabIndex={-1}>Novidades</h1><p>Seus bilhetes, conquistas e momentos, sempre no contexto de cada loja.</p></MimoIntro>
    <div className={styles.attention}><span>Em todas as suas lojas{attention.error && attention.data ? ' · última consulta' : ''}</span>
      {attention.data && <p role="status">{attention.data.attentionUnreadCount} {attention.data.attentionUnreadCount === 1 ? 'grupo pede' : 'grupos pedem'} sua atenção.</p>}
      {attention.loading && <p role="status">Consultando atenção…</p>}
      {attention.error && !attention.denied ? <p role="status">O contador está indisponível agora. <Button variant="secondary" onClick={attention.reload}>Consultar contador novamente</Button></p> : null}
    </div></header>
    <div className={styles.layout}><aside className={styles.filters} aria-labelledby="notification-filters-title"><h2 id="notification-filters-title"><MimoIcon name="activities" />Filtrar novidades</h2>
      <StoreSelector key={filterRevision} label="Loja" emptyLabel="Todas as lojas" value={storeId} onChange={value => { setStoreId(value); setPage(1); }} />
      <label className={styles.field}>Categoria<select className="ui-input" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}>
        <option value="">Todas as categorias</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value as NotificationCategory}>{label}</option>)}</select></label>
      <Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button>
      <Link href="/conta">Ajustar preferências de novidades</Link>
    </aside>
    <section className={styles.results} aria-labelledby="notification-results-title" aria-busy={resource.refreshing || action.busy}>
    <div className={styles.resultsHeader}><h2 id="notification-results-title">Suas novidades</h2>
      {resource.data && <p>{resource.data.total} {resource.data.total === 1 ? 'grupo neste filtro' : 'grupos neste filtro'}{resource.error ? ' · última consulta' : ''}</p>}</div>
    <p role="alert">{action.error}</p>{action.busy && <p role="status">Conferindo a novidade…</p>}
    {resource.loading && <p role="status">Buscando novidades…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={() => { void resource.reload(); void attention.reload(); }}>Consultar novidades novamente</Button></div> : null}
    {resource.data && <>{!resource.data.items.length && <MimoEmpty kind="envelope"><p>Nenhuma novidade neste filtro.</p><p>Você pode ajustar os filtros ou voltar às suas lojas para continuar.</p></MimoEmpty>}
      <div className={styles.list}>{resource.data.items.map(group => <NotificationCard key={group.id} group={group} onRead={(heading, button) => read(group, heading, button)} onOpen={button => open(group, button)} busy={action.busy} />)}</div>
      <Pagination {...resource.data} onPage={next => { focusAfterPage.current = true; setPage(next); }} busy={action.busy} /></>}
    </section></div>
    <Dialog open={!!destination} onOpenChange={open => { if (!open) setDestination(null); }} title="Abrir no contexto da loja" returnFocusRef={trigger}>
      {destination && <><p>Você vai abrir <strong>{destination.store.name || 'Sua lojinha'}</strong> como <strong>{destination.store.role === 'MERCHANT' ? 'lojista' : 'participante'}</strong>.</p>
        <p>Ler esta novidade não confirma a leitura de um bilhete e não altera pontos ou tickets.</p>
        {destination.target.path ? <Button onClick={() => { const path = destination.target.path; if (path) router.push(path); }}>Abrir nesta loja</Button> : <p>O destino deste item ainda não está disponível.</p>}</>}
    </Dialog>
  </div>;
}
export function NotificationCenter() {
  return <main className="stores-shell"><MimoMasthead /><PrivateArea>{session => <RewardAccess key={`${session.userId}:${session.sessionId}`}>
    <RelationshipRefresh accountKey={`${session.userId}:${session.sessionId}`}><Center /></RelationshipRefresh>
  </RewardAccess>}</PrivateArea></main>;
}
