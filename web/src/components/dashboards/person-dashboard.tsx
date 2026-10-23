'use client';

import Link from 'next/link';
import type { PersonDashboard as PersonData } from '@/contracts/dashboards';
import type { StoreView } from '@/contracts/stores';
import { PointsSummary } from '@/components/ui/points-summary';
import { Button } from '@/components/ui/button';
import { ParticipantNote } from '@/components/notes/note-area';
import { FeedCard } from '@/components/feed/feed-card';
import { storeError } from '@/components/stores/store-api';
import { useRelationshipResource } from '@/components/notifications/use-relationship-resource';
import styles from '@/components/notifications/relationship.module.css';
import dashboard from './dashboard.module.css';

export function PersonDashboard({ store, membershipId, accountKey }: { store: StoreView; membershipId: string; accountKey: string }) {
  const resource = useRelationshipResource<PersonData>(`/api/lojas/${store.id}/participacoes/${membershipId}/resumo`); const data = resource.data;
  return <section className={`${styles.stack} ${dashboard.person}`}><Link className="stores-link" href={`/lojas/${store.id}/pessoas`}>Voltar para pessoas</Link>
    {resource.loading && <p role="status">Consultando esta relação…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar relação novamente</Button></div> : null}
    {data && <><h2>{data.person.profile.displayName || 'Pessoa participante'}</h2>
      {data.person.closedAt && <p>Esta participação está encerrada. Histórico e pendências continuam acessíveis.</p>}
      <nav className={`${styles.actions} ${dashboard.personLinks}`} aria-label="Acessos desta relação"><Link className="stores-link" href={`/lojas/${store.id}/mural?type=SUBMISSION&participantMembershipId=${membershipId}`}>Ver conquistas desta pessoa</Link>
        <Link className="stores-link" href={`/lojas/${store.id}/tickets?membershipId=${membershipId}`}>Ver resgates desta pessoa</Link>
        <Link className="stores-link" href={`/lojas/${store.id}/mural?participantMembershipId=${membershipId}`}>Abrir mural desta relação</Link></nav>
      <div className={dashboard.personLayout}><div className={dashboard.personMain}>
      <dl className={`${styles.metrics} ${dashboard.personMetrics}`}><div><dt>Registros em análise</dt><dd>{data.pendingSubmissions}</dd></div><div><dt>Mimos a realizar</dt><dd>{data.outstandingTickets}</dd></div></dl>
      <section className={styles.stack}><h2>Conquistas e mimos recentes</h2>{!data.recent.length && <p>Os momentos desta relação aparecerão aqui.</p>}
        {data.recent.map(item => <FeedCard key={item.id} item={item} merchant accountKey={accountKey} />)}</section>
      </div><aside className={dashboard.personSupport} aria-label="Saldo e bilhete desta relação"><PointsSummary compact storeName={store.name || 'Sua lojinha'} available={data.points.available} pending={data.points.pending} />
      <ParticipantNote storeId={store.id} membershipId={membershipId} /></aside></div>
    </>}
  </section>;
}
