'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TicketEventPage, TicketEventView, TicketView } from '@/contracts/redemptions';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/activities/activity-display';
import { localTime, points } from '@/components/activities/format';
import { storeError } from '@/components/stores/store-api';
import { useRewardResource } from '@/components/rewards/access';
import { civilDate, eventLabels } from './action-labels';
import { ticketApiPath } from './transport';
import styles from './tickets.module.css';

function EventList({ items, timezone }: { items: TicketEventView[]; timezone: string }) {
  return <ol className={styles.events}>{items.map(event => <li key={event.id}><p><strong>{eventLabels[event.kind]}</strong> por {event.author.displayName || 'Pessoa da relação'} ·
    {' '}<time dateTime={event.createdAt}>{localTime(event.createdAt, timezone)}</time> · {timezone}</p>
    {event.text && <p className={styles.text}>{event.text}</p>}
    {event.kind === 'AGREE' && <p>{event.agreementDate ? `Data combinada: ${civilDate(event.agreementDate)}` : 'Sem data combinada.'}</p>}
    {event.kind === 'CANCEL' && <><p>{points(event.delta)} pontos devolvidos. {event.restocked ? 'Uma unidade reposta no estoque.' : 'Sem reposição de estoque.'}</p>
      {event.balanceAfter !== null && <p>Saldo após a devolução na ocasião: {points(event.balanceAfter)} pontos.</p>}</>}
  </li>)}</ol>;
}
function HistoryPage({ ticket, page, onPage, onLoaded }: { ticket: TicketView; page: number; onPage: (page: number) => void; onLoaded: (page: number) => void }) {
  const { data, loading, error, denied, reload } = useRewardResource<TicketEventPage>(`${ticketApiPath(ticket.storeId, ticket.id)}/eventos?page=${page}&pageSize=20`);
  useEffect(() => { if (data?.page === page) onLoaded(page); }, [data, page, onLoaded]);
  if (denied) return null;
  return <>{loading && <p role="status">Consultando acontecimentos…</p>}{error ? <><p role="alert">{storeError(error)}</p><Button variant="secondary" onClick={reload}>Consultar histórico novamente</Button></> : null}
    {data && <><EventList items={data.items} timezone={ticket.timezone} /><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={onPage} /></>}</>;
}
export function TicketHistory({ ticket }: { ticket: TicketView }) {
  const [page, setPage] = useState(1);
  const title = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const navigate = useCallback((next: number) => { pendingFocus.current = next; setPage(next); }, []);
  const focusLoadedPage = useCallback((loadedPage: number) => {
    if (pendingFocus.current !== loadedPage) return;
    pendingFocus.current = null; title.current?.focus();
  }, []);
  useEffect(() => { if (page === 1) focusLoadedPage(1); }, [page, focusLoadedPage]);
  return <section className="stores-card" aria-label="Histórico deste ticket"><h3 ref={title} tabIndex={-1}>Histórico deste ticket</h3>
    {page === 1 ? <><EventList items={ticket.events} timezone={ticket.timezone} /><Pagination page={1} pageSize={20} total={ticket.eventsTotal} onPage={navigate} /></> :
      <HistoryPage ticket={ticket} page={page} onPage={navigate} onLoaded={focusLoadedPage} />}
  </section>;
}
