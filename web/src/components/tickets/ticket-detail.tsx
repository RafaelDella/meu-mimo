'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlbumPreview } from '@/contracts/albums';
import type { TicketView } from '@/contracts/redemptions';
import type { StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { ConversationPanel } from '@/components/conversation/conversation-panel';
import { conversationTransport } from '@/components/conversation/transport';
import type { ConversationTransport } from '@/components/conversation/transport';
import { storeError } from '@/components/stores/store-api';
import { localTime, points } from '@/components/activities/format';
import { useRewardAccess, useRewardResource } from '@/components/rewards/access';
import { apiBase, rewardPath, ticketPath } from '@/components/rewards/transport';
import { RewardIllustration } from '@/components/rewards/reward-display';
import { RewardBalance } from '@/components/rewards/reward-summary';
import { TicketStatusBadge } from './ticket-display';
import { TicketActions } from './ticket-actions';
import { TicketHistory } from './ticket-history';
import { TicketProjection } from './ticket-projection';
import { TicketAlbum } from '@/components/albums/ticket-album';
import rewardStyles from '@/components/rewards/rewards.module.css';
import { MimoIcon } from '@/components/ui/mimo-icon';
import styles from './tickets.module.css';

export function TicketDetail({ store, accountKey, ticketId, returnTo }: { store: StoreView; accountKey: string; ticketId: string; returnTo?: string }) {
  const { data: ticket, error, loading, denied, reload } = useRewardResource<TicketView>(`${apiBase(store.id)}/tickets/${encodeURIComponent(ticketId)}`);
  if (denied) return null;
  if (loading) return <p role="status">Abrindo ticket…</p>;
  if (error || !ticket) return <section className="stores-card"><h2>Ticket indisponível</h2><p role="alert">{storeError(error)}</p><Button variant="secondary" onClick={reload}>Consultar ticket novamente</Button></section>;
  return <TicketContent key={`${accountKey}:${ticket.id}`} store={store} accountKey={accountKey} initial={ticket} returnTo={returnTo} />;
}
function TicketContent({ store, accountKey, initial, returnTo }: { store: StoreView; accountKey: string; initial: TicketView; returnTo?: string }) {
  const [ticket, setTicket] = useState(initial);
  const updatePreview = useCallback((album: AlbumPreview) => setTicket(current => ({ ...current, album })), []);
  const unavailable = useRewardAccess();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, []);
  const transport = useMemo<ConversationTransport>(() => ({
    list: async (context, page, signal) => {
      try { return await conversationTransport.list(context, page, signal); }
      catch (cause) { if (!signal.aborted) unavailable(cause); throw cause; }
    },
    send: async (context, body, signal) => {
      try { return await conversationTransport.send(context, body, signal); }
      catch (cause) { if (!signal.aborted) unavailable(cause); throw cause; }
    },
  }), [unavailable]);
  const reward = ticket.snapshot;
  return <div className={styles.detailPage}><Link className="stores-link" href={returnTo ?? ticketPath(store.id)}>{returnTo?.split('?')[0].endsWith('/mural') ? 'Voltar ao mural com os filtros' : returnTo?.split('?')[0].endsWith('/extrato') ? 'Voltar ao extrato com os filtros' : 'Voltar aos tickets com os filtros'}</Link>
    <article className={`${rewardStyles.ticket} ${styles.summary}`} aria-label="Seu vale mimo"><div className={styles.summaryCopy}>
      <div className={rewardStyles.ticketHeading}><p>Vale mimo · {ticket.code}</p><MimoIcon name="bow" /></div>
      <h2 ref={title} tabIndex={-1}>{reward.name}</h2><div className={styles.statusLine}><TicketStatusBadge status={ticket.status} /><p className={styles.cost}>{points(reward.cost)} pontos · Uma unidade</p></div>
      {store.role === 'MERCHANT' && <p>Participante: {ticket.participant.displayName || 'Pessoa participante'}</p>}</div>
      <div className={styles.summaryArt} aria-hidden="true"><RewardIllustration sticker={reward.sticker} /></div></article>
    <div className={styles.detailLayout}><div className={styles.detailMain}>
      <TicketActions ticket={ticket} onUpdate={setTicket} />
      <TicketProjection ticket={ticket} />
      <section className={`stores-card ${styles.receipt}`} aria-label="Conteúdo da ocasião"><h3>Conteúdo da ocasião</h3>
      {reward.category && <p>{reward.category}</p>}<p className={styles.text}>{reward.description}</p>
      {reward.note && <><h4>Recadinho da ocasião</h4><p className={styles.text}>{reward.note}</p></>}
      {reward.instructions && <><h4>Instruções da ocasião</h4><p className={styles.text}>{reward.instructions}</p></>}
      <dl className="stores-details"><div><dt>Emissão</dt><dd><time dateTime={ticket.createdAt}>{localTime(ticket.createdAt, ticket.timezone)}</time> · {ticket.timezone}</dd></div>
        <div><dt>Saldo antes do resgate</dt><dd>{points(ticket.balanceBefore)} pontos</dd></div><div><dt>Saldo após o resgate</dt><dd>{points(ticket.balanceAfter)} pontos</dd></div></dl>
      <p>Este vale preserva o conteúdo e o custo da ocasião. Tickets não expiram.</p></section>
    <TicketAlbum key={`${accountKey}:${ticket.id}:${ticket.status}`} ticket={ticket} accountKey={accountKey} onPreviewChange={updatePreview} />
    <ConversationPanel accountKey={accountKey} storeId={store.id} conversationId={ticket.conversation.id} transport={transport} />
    </div><aside className={styles.support} aria-label="Consulta e histórico do ticket">
    {store.role === 'PARTICIPANT' && <div><RewardBalance key={ticket.version} store={store} compact /></div>}
    <TicketHistory key={ticket.version} ticket={ticket} />
    {store.role === 'PARTICIPANT' && <Link className="stores-link" href={rewardPath(store.id, ticket.rewardId)}>Resgatar novamente</Link>}
    </aside></div></div>;
}
