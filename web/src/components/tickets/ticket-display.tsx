import Link from 'next/link';
import type { TicketStatus, TicketView } from '@/contracts/redemptions';
import { localTime, points } from '@/components/activities/format';
import { ticketPath } from '@/components/rewards/transport';
import styles from '@/components/rewards/rewards.module.css';
import { TicketAlbumPreview } from '@/components/albums/album-preview';

export const ticketStatuses: Record<TicketStatus, string> = { WAITING_AGREEMENT: 'Aguardando combinar', AGREED: 'Combinado', FULFILLED: 'Realizado', CANCELLATION_REQUESTED: 'Cancelamento solicitado', CANCELLED: 'Cancelado' };
export function TicketCard({ ticket, merchant, returnTo }: { ticket: TicketView; merchant: boolean; returnTo: string }) {
  return <article className={styles.ticket}><p>Vale mimo · {ticket.code}</p><h3>{ticket.snapshot.name}</h3><p>{ticketStatuses[ticket.status]}</p>
    <p>{points(ticket.snapshot.cost)} pontos da ocasião</p>{merchant && <p>Participante: {ticket.participant.displayName || 'Pessoa participante'}</p>}
    <p><time dateTime={ticket.createdAt}>{localTime(ticket.createdAt, ticket.timezone)}</time> · {ticket.timezone}</p>
    <TicketAlbumPreview storeId={ticket.storeId} preview={ticket.album} />
    <Link className="stores-link" href={`${ticketPath(ticket.storeId, ticket.id)}?voltar=${encodeURIComponent(returnTo)}`}>Abrir ticket<span className={styles.srOnly}>: {ticket.snapshot.name}, {ticket.code}</span></Link></article>;
}
