import Link from 'next/link';
import type { TicketStatus, TicketView } from '@/contracts/redemptions';
import { localTime, points } from '@/components/activities/format';
import { ticketPath } from '@/components/rewards/transport';
import styles from '@/components/rewards/rewards.module.css';
import { TicketAlbumPreview } from '@/components/albums/album-preview';
import { MimoIcon } from '@/components/ui/mimo-icon';
import { StatusBadge } from '@/components/ui/status-badge';
import ticketStyles from './tickets.module.css';

export const ticketStatuses: Record<TicketStatus, string> = { WAITING_AGREEMENT: 'Aguardando combinar', AGREED: 'Combinado', FULFILLED: 'Realizado', CANCELLATION_REQUESTED: 'Cancelamento solicitado', CANCELLED: 'Cancelado' };
export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const tone = status === 'FULFILLED' ? 'success' : status === 'CANCELLATION_REQUESTED' || status === 'WAITING_AGREEMENT' ? 'pending' : 'info';
  return <StatusBadge tone={tone} text={ticketStatuses[status]} />;
}
export function TicketCard({ ticket, merchant, returnTo }: { ticket: TicketView; merchant: boolean; returnTo: string }) {
  return <article className={`${styles.ticket} ${ticketStyles.listCard}`}><div className={styles.ticketHeading}><p>Vale mimo · {ticket.code}</p><MimoIcon name="bow" /></div><h3>{ticket.snapshot.name}</h3><p><TicketStatusBadge status={ticket.status} /></p>
    <p className={ticketStyles.cost}>{points(ticket.snapshot.cost)} pontos da ocasião</p>{merchant && <p>Participante: {ticket.participant.displayName || 'Pessoa participante'}</p>}
    <Link className={`stores-link ${ticketStyles.openTicket}`} href={`${ticketPath(ticket.storeId, ticket.id)}?voltar=${encodeURIComponent(returnTo)}`}>Abrir ticket<span className={styles.srOnly}>: {ticket.snapshot.name}, {ticket.code}</span></Link>
    <p className={ticketStyles.issued}><time dateTime={ticket.createdAt}>{localTime(ticket.createdAt, ticket.timezone)}</time> · {ticket.timezone}</p>
    <TicketAlbumPreview storeId={ticket.storeId} preview={ticket.album} /></article>;
}
