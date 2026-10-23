'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DashboardEvent, MerchantDashboard, ParticipantDashboard } from '@/contracts/dashboards';
import type { PageResult, StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { PointsSummary } from '@/components/ui/points-summary';
import { ActivityCard } from '@/components/activities/activity-display';
import { RewardCard } from '@/components/rewards/reward-display';
import { OwnNote } from '@/components/notes/note-area';
import { storeError } from '@/components/stores/store-api';
import { Pagination } from '@/components/stores/store-controls';
import { useRelationshipResource } from '@/components/notifications/use-relationship-resource';
import { notificationLabels } from '@/components/notifications/notification-labels';
import styles from '@/components/notifications/relationship.module.css';

export function RecentEvents({ storeId, events }: { storeId: string; events: DashboardEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  return <section className={styles.card}><h2>Acontecimentos recentes</h2><EventsList events={events} />
    {expanded ? <AllEvents storeId={storeId} /> : <Button variant="secondary" onClick={() => setExpanded(true)}>Ver todos os acontecimentos</Button>}</section>;
}
function EventsList({ events }: { events: DashboardEvent[] }) {
  return <>{!events.length && <p>Os acontecimentos confirmados da loja aparecerão aqui.</p>}
    <ul className={styles.list}>{events.map(event => <li key={event.id}><Link href={event.path}>{event.author.displayName || 'Pessoa da relação'} {notificationLabels[event.kind]}</Link>
      {event.participant.displayName && <span> · {event.participant.displayName}</span>}<p className={styles.muted}><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString('pt-BR')}</time></p></li>)}</ul></>;
}
function AllEvents({ storeId }: { storeId: string }) {
  const [page, setPage] = useState(1); const resource = useRelationshipResource<PageResult<DashboardEvent>>(`/api/lojas/${storeId}/resumo/acontecimentos?page=${page}&pageSize=20`);
  return <>{resource.loading && <p role="status">Buscando acontecimentos…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar acontecimentos novamente</Button></div> : null}
    {resource.data && <><EventsList events={resource.data.items} /><Pagination {...resource.data} onPage={setPage} /></>}</>;
}
function MerchantHome({ store }: { store: StoreView }) {
  const resource = useRelationshipResource<MerchantDashboard>(`/api/lojas/${store.id}/resumo`); const data = resource.data;
  const checklistLabels = { PRESENTATION: 'Apresentação da loja', ACTIVITY: 'Primeira atividade ativa', REWARD: 'Primeiro mimo no catálogo', INVITATION: 'Primeiro convite ou participação' };
  return <section className={styles.stack}><h2>Resumo da sua loja</h2><p>{store.presentation || 'Pequenos gestos, conquistas e mimos em um cantinho só de vocês.'}</p>
    {resource.loading && <p role="status">Consultando o resumo da loja…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar resumo novamente</Button></div> : null}
    {data && <><dl className={styles.metrics}><div><dt>Registros em análise</dt><dd>{data.counts.pendingSubmissions}</dd></div><div><dt>Mimos a realizar</dt><dd>{data.counts.outstandingTickets}</dd></div><div><dt>Participantes ativos</dt><dd>{data.counts.activeParticipants}</dd></div></dl>
      <section className={styles.card}><h3>Prepare seu cantinho</h3><ul className={styles.list}>{data.checklist.map(item => <li key={item.key}>{item.done ? '✓ Concluído: ' : 'A preparar: '}<Link href={item.path}>{checklistLabels[item.key]}</Link></li>)}</ul></section>
      <section className={styles.card}><h3>Registros para cuidar</h3>{!data.pending.length && <p>Nenhum registro está aguardando análise.</p>}
        <ul className={styles.list}>{data.pending.map(item => <li key={item.id}><Link href={item.path}>{item.name}</Link> · {item.participantName || 'Pessoa participante'} · {item.status === 'CONTESTED' ? 'Em contestação' : 'Em análise'}</li>)}</ul>
        <Link className="stores-link" href={`/lojas/${store.id}/mural?type=SUBMISSION&status=PENDING`}>Ver registros recebidos</Link></section>
      <section className={styles.card}><h3>Mimos a realizar</h3>{!data.tickets.length && <p>Nenhum mimo aguarda realização.</p>}
        <ul className={styles.list}>{data.tickets.map(item => <li key={item.id}><Link href={item.path}>{item.name}</Link> · {item.participantName || 'Pessoa participante'}</li>)}</ul>
        <Link className="stores-link" href={`/lojas/${store.id}/tickets`}>Ver todos os resgates</Link></section>
      <RecentEvents storeId={store.id} events={data.recent} />
    </>}
  </section>;
}
function ParticipantHome({ store }: { store: StoreView }) {
  const resource = useRelationshipResource<ParticipantDashboard>(`/api/lojas/${store.id}/lojinha`); const data = resource.data;
  return <section className={styles.stack}>
    {resource.loading && <p role="status">Consultando sua lojinha…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar lojinha novamente</Button></div> : null}
    {data && <><section className={styles.card}><h2>Que bom ter você aqui{data.person.displayName ? `, ${data.person.displayName}` : ''}</h2>
      <p>Uma lojinha preparada por {data.merchant.displayName || 'quem oferece os mimos'}.</p><p>{store.presentation}</p></section>
      <PointsSummary storeName={store.name || 'Sua lojinha'} available={data.points.available} pending={data.points.pending} />
      {BigInt(data.points.available) < 0n && <p role="status">Seu saldo está negativo por ajustes registrados. Os tickets já emitidos continuam válidos.</p>}
      <section className={styles.card}><h3>Hoje nesta loja</h3><p>{data.points.today.localDate.split('-').reverse().join('/')} · {data.points.today.timezone}</p>
        <p>{data.points.today.submitted} registros enviados · {data.points.today.approved} aprovados.</p><p>Créditos de atividades: {data.points.today.credited} pontos. Ajustes líquidos: {data.points.today.adjusted} pontos.</p>
        <Link className="stores-link" href={`/lojas/${store.id}/extrato`}>Ver extrato de pontos</Link></section>
      <OwnNote storeId={store.id} />
      <section><h2>Atividades para você</h2>{!data.activities.length && <p>Quando a loja preparar atividades, elas aparecerão aqui.</p>}
        <div className="stores-grid">{data.activities.map(activity => <ActivityCard key={activity.id} activity={activity} merchant={false} />)}</div>
        <Link className="stores-link" href={`/lojas/${store.id}/atividades`}>Ver todas as atividades</Link></section>
      <section><h2>Vitrine de mimos</h2>{!data.rewards.length && <p>Os próximos mimos preparados para você aparecerão aqui.</p>}
        {data.categories.length > 0 && <p>Categorias: {data.categories.join(' · ')}</p>}
        <div className="stores-grid">{data.rewards.map(reward => <RewardCard key={reward.id} reward={reward} merchant={false} />)}</div>
        <Link className="stores-link" href={`/lojas/${store.id}/mimos`}>Ver todos os mimos</Link></section>
      <section className={styles.card}><h3>Seus mimos</h3><p>{data.tickets.outstanding} mimos ainda a realizar · {data.tickets.total} tickets no histórico.</p><Link className="stores-link" href={`/lojas/${store.id}/tickets`}>Abrir meus tickets</Link></section>
    </>}
  </section>;
}
export function StoreDashboard({ store }: { store: StoreView }) { return store.role === 'MERCHANT' ? <MerchantHome store={store} /> : <ParticipantHome store={store} />; }
