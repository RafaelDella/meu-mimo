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
import { categoryLabels, notificationLabels } from './notification-labels';
import styles from './relationship.module.css';
import { StoreSelector } from './store-selector';

function NotificationCard({ group, onRead, onOpen, busy }: { group: NotificationGroupView; onRead(): void; onOpen(trigger: HTMLButtonElement): void; busy: boolean }) {
  return <article className={styles.card}><h2>{group.storeName || 'Sua lojinha'}</h2>
    <p><strong>{group.latest.actor.displayName || 'Pessoa da relação'}</strong> {notificationLabels[group.latest.kind]}.</p>
    <p className={styles.muted}>{categoryLabels[group.category]} · <time dateTime={group.lastOccurredAt}>{new Date(group.lastOccurredAt).toLocaleString('pt-BR')}</time></p>
    {group.count > 1 && <p>{group.count} interações neste grupo.</p>}
    <p>{group.unreadCount ? `${group.unreadCount} ${group.unreadCount === 1 ? 'novidade não lida' : 'novidades não lidas'}` : 'Lido'}{!group.attentionActive ? ' · Sem aviso ativo no contador' : ''}</p>
    <div className={styles.actions}><Button variant="secondary" disabled={busy} onClick={event => onOpen(event.currentTarget)}>Abrir novidade</Button>
      {group.unreadCount > 0 && <Button variant="secondary" disabled={busy} onClick={onRead}>Marcar grupo como lido</Button>}</div>
  </article>;
}
function Center() {
  const [storeId, setStoreId] = useState(''); const [category, setCategory] = useState(''); const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '20', ...(storeId ? { storeId } : {}), ...(category ? { category } : {}) });
  const resource = useRelationshipResource<NotificationGroupPage>(`/api/notificacoes/grupos?${params}`);
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
  function read(group: NotificationGroupView) {
    void action.run(async signal => {
      try { return await storeRequest(`/api/notificacoes/grupos/${group.id}/lida`, 'POST', { throughVersion: group.version }, signal); }
      catch (cause) { failed(cause); throw cause; }
    }, () => { void resource.reload(); invalidateRelationship(); });
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
  return <div className={styles.stack}><header className={styles.card}><div className={styles.actions}><Link href="/lojas">Minhas lojas</Link><Link href="/conta">Minha conta</Link></div>
    <h1 ref={title} tabIndex={-1}>Novidades</h1><p>Seus bilhetes, conquistas e momentos, sempre no contexto de cada loja.</p>
    {resource.data && <p role="status">{resource.data.attentionUnreadCount} {resource.data.attentionUnreadCount === 1 ? 'grupo pede' : 'grupos pedem'} sua atenção.</p>}</header>
    <div className={styles.filters}><StoreSelector label="Loja" emptyLabel="Todas as lojas" value={storeId} onChange={value => { setStoreId(value); setPage(1); }} />
      <label className={styles.field}>Categoria<select className="ui-input" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}>
        <option value="">Todas as categorias</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value as NotificationCategory}>{label}</option>)}</select></label></div>
    <p role="alert">{action.error}</p>{action.busy && <p role="status">Conferindo a novidade…</p>}
    {resource.loading && <p role="status">Buscando novidades…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar novidades novamente</Button></div> : null}
    {resource.data && <>{!resource.data.items.length && <p>Nenhuma novidade neste filtro.</p>}
      {resource.data.items.map(group => <NotificationCard key={group.id} group={group} onRead={() => read(group)} onOpen={button => open(group, button)} busy={action.busy} />)}
      <Pagination {...resource.data} onPage={next => { focusAfterPage.current = true; setPage(next); }} busy={action.busy} /></>}
    <Dialog open={!!destination} onOpenChange={open => { if (!open) setDestination(null); }} title="Abrir no contexto da loja" returnFocusRef={trigger}>
      {destination && <><p>Você vai abrir <strong>{destination.store.name || 'Sua lojinha'}</strong> como <strong>{destination.store.role === 'MERCHANT' ? 'lojista' : 'participante'}</strong>.</p>
        <p>Ler esta novidade não confirma a leitura de um bilhete e não altera pontos ou tickets.</p>
        {destination.target.path ? <Button onClick={() => { const path = destination.target.path; if (path) router.push(path); }}>Abrir nesta loja</Button> : <p>O destino deste item ainda não está disponível.</p>}</>}
    </Dialog>
  </div>;
}
export function NotificationCenter() {
  return <main className="stores-shell"><PrivateArea>{session => <RewardAccess key={`${session.userId}:${session.sessionId}`}>
    <RelationshipRefresh accountKey={`${session.userId}:${session.sessionId}`}><Center /></RelationshipRefresh>
  </RewardAccess>}</PrivateArea></main>;
}
