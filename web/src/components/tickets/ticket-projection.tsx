import type { TicketView } from '@/contracts/redemptions';
import { localTime } from '@/components/activities/format';
import { civilDate } from './action-labels';
import styles from './tickets.module.css';

export function TicketProjection({ ticket }: { ticket: TicketView }) {
  return <section className="stores-card" aria-label="Situação atual do ticket"><h3>Combinado e realização</h3>
    {ticket.agreementText ? <><p className={styles.text}>{ticket.agreementText}</p><p>{ticket.agreementDate ? `Data combinada: ${civilDate(ticket.agreementDate)}` : 'Sem data combinada.'} · {ticket.timezone}</p></> : <p>Ainda não há um combinado registrado.</p>}
    {ticket.pendingCancellation && <><h4>Cancelamento solicitado</h4><p className={styles.text}>{ticket.pendingCancellation.text}</p>
      <p>Pedido em <time dateTime={ticket.pendingCancellation.createdAt}>{localTime(ticket.pendingCancellation.createdAt, ticket.timezone)}</time>. A realização está bloqueada enquanto o pedido aguarda decisão.</p></>}
    {ticket.fulfilledAt && <p>Realizado em <time dateTime={ticket.fulfilledAt}>{localTime(ticket.fulfilledAt, ticket.timezone)}</time> · {ticket.timezone}. Nenhum ponto foi descontado novamente.</p>}
    {ticket.cancelledAt && <p>Cancelado e estornado em <time dateTime={ticket.cancelledAt}>{localTime(ticket.cancelledAt, ticket.timezone)}</time> · {ticket.timezone}. Os pontos da ocasião foram devolvidos.</p>}
  </section>;
}
