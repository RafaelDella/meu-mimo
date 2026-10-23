'use client';

import Link from 'next/link';
import type { StoreView } from '@/contracts/stores';
import { TicketDetail } from '@/components/tickets/ticket-detail';
import { TicketList } from '@/components/tickets/ticket-list';
import { RewardAccess } from './access';
import { RewardCatalog } from './reward-catalog';
import { RewardEditor } from './reward-editor';
import { RewardDetail } from './reward-detail';
import { RewardBalance, RewardCounter } from './reward-summary';
import { rewardPath, ticketPath } from './transport';
import type { RewardRoute } from './transport';
import styles from './rewards.module.css';
import { MimoIntro } from '@/components/ui/mimo-page';

export function RewardTabs({ store, active }: { store: StoreView; active: 'catalog' | 'tickets' | 'statement' }) {
  return <nav className={styles.tabs} aria-label={store.role === 'MERCHANT' ? 'Mimos da loja' : 'Meus mimos'}>
    {store.role === 'MERCHANT' ? <Link href={rewardPath(store.id)} aria-current={active === 'catalog' ? 'page' : undefined}>Catálogo</Link> : null}
    <Link href={ticketPath(store.id)} aria-current={active === 'tickets' ? 'page' : undefined}>{store.role === 'MERCHANT' ? 'Resgates' : 'Tickets'}</Link>
    {store.role === 'PARTICIPANT' && <Link href={`/lojas/${store.id}/extrato`} aria-current={active === 'statement' ? 'page' : undefined}>Extrato</Link>}
  </nav>;
}
export function RewardArea({ store, accountKey, route }: { store: StoreView; accountKey: string; route: RewardRoute }) {
  const list = route.view === 'catalog' || route.view === 'tickets';
  return <RewardAccess><div className={styles.area}>
    {list && <>{store.role === 'PARTICIPANT' && route.view === 'tickets' && <MimoIntro kind="ticket"><p className="mimo-eyebrow">Carinhos que viram momentos</p><h2>Meus mimos</h2><p>Guarde seus vales e combine os próximos momentos de vocês.</p></MimoIntro>}
      {(store.role === 'MERCHANT' || route.view === 'tickets') && <RewardTabs store={store} active={route.view === 'catalog' ? 'catalog' : 'tickets'} />}
      {store.role === 'PARTICIPANT' && <RewardBalance store={store} />}<RewardCounter store={store} showTotal={route.view === 'tickets'} /></>}
    {route.view === 'catalog' ? <RewardCatalog store={store} query={route.query} /> : route.view === 'new' ? <RewardEditor store={store} /> :
      route.view === 'edit' ? <RewardEditor store={store} rewardId={route.rewardId} /> : route.view === 'detail' ? <RewardDetail store={store} rewardId={route.rewardId} operationId={route.operationId} /> :
        route.view === 'tickets' ? <TicketList store={store} query={route.query} /> : <TicketDetail store={store} accountKey={accountKey} ticketId={route.ticketId} returnTo={route.returnTo} />}
  </div></RewardAccess>;
}
export function RewardHome({ store }: { store: StoreView }) {
  return <RewardAccess><div className={styles.area}>{store.role === 'PARTICIPANT' && <RewardBalance store={store} />}
    <RewardCounter store={store} /><RewardCatalog store={store} compact /></div></RewardAccess>;
}
