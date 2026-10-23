'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { StoreNavigation } from '@/components/navigation/store-navigation';
import type { StoreSection } from '@/components/navigation/store-navigation';
import { PrivateArea } from './private-area';
import { StoreSettings } from './store-settings';
import { StorePeople } from './store-people';
import { StoreInvitations } from './store-invitations';
import { storeError } from './store-api';
import { ActivityArea } from '@/components/activities/activity-area';
import type { ActivityRoute } from '@/components/activities/transport';
import { RewardArea } from '@/components/rewards/reward-area';
import type { RewardRoute } from '@/components/rewards/transport';
import { RewardAccess } from '@/components/rewards/access';
import { TicketSummaryProvider } from '@/components/rewards/reward-summary';
import { RelationshipRefresh } from '@/components/notifications/relationship-refresh';
import { useRelationshipResource } from '@/components/notifications/use-relationship-resource';
import { StoreDashboard } from '@/components/dashboards/store-dashboard';
import { PersonDashboard } from '@/components/dashboards/person-dashboard';
import { FeedArea } from '@/components/feed/feed-area';
import styles from '@/components/notifications/relationship.module.css';
import { MimoMasthead } from '@/components/ui/mimo-page';

function Workspace({ storeId, section, accountKey, activityRoute, rewardRoute, membershipId }: { storeId: string; section: StoreSection; accountKey: string; activityRoute?: ActivityRoute; rewardRoute?: RewardRoute; membershipId?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const focusAfterRefresh = useRef(false);
  const { data: store, error, loading, refreshing, reload } = useRelationshipResource<StoreView>(`/api/lojas/${encodeURIComponent(storeId)}`);
  function refresh() { focusAfterRefresh.current = true; void reload(); }
  useEffect(() => {
    if (loading || refreshing || !focusAfterRefresh.current) return;
    focusAfterRefresh.current = false;
    frame.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [loading, refreshing]);
  if (loading) return <p role="status">Abrindo sua loja…</p>;
  if (!store) return <div ref={frame} className="stores-card"><h1 tabIndex={-1}>Loja indisponível</h1>
    <p role="alert">{storeError(error)}</p><div className="stores-actions"><Link className="stores-link" href="/lojas">Minhas lojas</Link>
      <Button variant="secondary" onClick={reload}>Tentar novamente</Button></div></div>;
  const restricted = !['home', 'people', 'feed', 'activities', 'statement', 'rewards', 'tickets'].includes(section) && store.role !== 'MERCHANT';
  return <TicketSummaryProvider key={`${store.id}:${store.membershipId}`} store={store}><div ref={frame} aria-busy={refreshing} className={styles.layout}>
    <div className={styles.sidebar}><StoreNavigation store={store} section={section} /></div><div className={styles.stack}>
    {error ? <div role="alert" className="stores-banner"><p>Não foi possível atualizar o contexto da loja. {storeError(error)}</p>
      <Button variant="secondary" onClick={refresh}>Atualizar contexto da loja</Button></div> : null}
    {store.platformPausedAt && <p className="stores-banner" role="status">Novas ações pausadas pela plataforma. Novos convites, registros, resgates e evidências de novas conquistas estão suspensos. Análises, tickets e demais pendências existentes continuam acessíveis.</p>}
    {store.state !== 'ACTIVE' && <p className="stores-banner" role="status">{store.state === 'PAUSED' ?
      'Esta loja está pausada. Novos convites, conquistas e resgates estão suspensos. O histórico continua acessível.' :
      'Esta loja foi encerrada. Você continua com acesso privado ao histórico e aos mimos já emitidos.'}</p>}
    {store.membershipClosedAt && <p className="stores-banner" role="status">Sua participação foi encerrada. Este cantinho continua disponível para consulta do seu histórico e pendências.</p>}
    {restricted ? <section className="stores-card"><h2>Acesso indisponível</h2><p>Esta área é reservada a quem gerencia a loja.</p></section> :
      section === 'person' && membershipId ? <PersonDashboard store={store} membershipId={membershipId} accountKey={accountKey} /> :
      section === 'feed' ? <FeedArea store={store} accountKey={accountKey} /> :
      section === 'rewards' || section === 'tickets' ? <RewardArea key={JSON.stringify(rewardRoute)} store={store} accountKey={accountKey} route={rewardRoute ?? { view: 'catalog', query: '' }} /> :
      section === 'activities' || section === 'statement' ? <ActivityArea key={JSON.stringify(activityRoute)} store={store} accountKey={accountKey} route={activityRoute ?? { view: 'list' }} /> :
        section === 'settings' ? <StoreSettings key={store.id} store={store} onUpdate={refresh} /> :
        section === 'people' ? <StorePeople key={store.id} store={store} onUpdate={refresh} /> :
          section === 'invitations' ? <StoreInvitations key={store.id} store={store} /> : <StoreDashboard store={store} />}
  </div></div></TicketSummaryProvider>;
}

export function StoreWorkspace({ storeId, section, activityRoute, rewardRoute, membershipId }: { storeId: string; section: StoreSection; activityRoute?: ActivityRoute; rewardRoute?: RewardRoute; membershipId?: string }) {
  return <main className="stores-shell"><MimoMasthead /><PrivateArea>{session =>
    <RewardAccess key={`${session.userId}:${session.sessionId}:${storeId}`}><RelationshipRefresh accountKey={`${session.userId}:${session.sessionId}`} storeId={storeId}><Workspace storeId={storeId} section={section}
      accountKey={`${session.userId}:${session.sessionId}`} activityRoute={activityRoute} rewardRoute={rewardRoute} membershipId={membershipId} /></RelationshipRefresh></RewardAccess>
  }</PrivateArea></main>;
}
