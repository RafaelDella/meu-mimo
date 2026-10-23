import Link from 'next/link';
import Image from 'next/image';
import type { ActivityAvailability, ActivityFields, ActivityView, SubmissionView } from '@/contracts/activities';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { SubmissionBadges } from '@/components/submissions/review-display';
import { localTime, points } from './format';
import { activityPath } from './transport';
import styles from './activities.module.css';

export { localTime, points } from './format';
export function frequency(activity: Pick<ActivityFields, 'frequency' | 'weeklyLimit'>) {
  return activity.frequency === 'ONCE' ? 'Uma vez por participante' : activity.frequency === 'DAILY' ? 'Uma vez por dia' : `Até ${activity.weeklyLimit} ${activity.weeklyLimit === 1 ? 'vez' : 'vezes'} por semana`;
}
export function Rule({ activity }: { activity: ActivityFields }) {
  return <><p><strong>{points(activity.points)} pontos por conquista aprovada</strong> · {frequency(activity)}</p>
    <p>{activity.approvalMode === 'MANUAL' ? 'Precisa da aprovação de quem gerencia a loja. Os pontos ficam em análise até a aprovação.' :
      'Libera pontos automaticamente após o envio confirmado. O registro ainda pode ser contestado depois.'}</p></>;
}
export function Availability({ value }: { value: ActivityAvailability | null }) {
  if (!value) return null;
  return <div className={styles.availability}>
    <p>{value.reason === 'AVAILABLE' ? `${value.remaining} ${value.remaining === 1 ? 'registro disponível' : 'registros disponíveis'} neste período.` :
      value.reason === 'LIMIT' ? 'Você já usou os registros disponíveis neste período.' : value.reason === 'ARCHIVED' ? 'Esta atividade foi arquivada. Os registros anteriores continuam acessíveis.' :
        value.reason === 'MEMBERSHIP_CLOSED' ? 'Sua participação foi encerrada. Você pode consultar seu histórico.' : value.reason === 'STORE_PLATFORM_PAUSED' ? 'Novos registros e evidências de novas conquistas estão pausados pela plataforma. Seu histórico e as pendências existentes continuam acessíveis.' : 'Novos registros estão suspensos nesta loja.'}</p>
    {value.reason === 'LIMIT' && value.endsAt && <p>Nova disponibilidade em {localTime(value.endsAt, value.timezone)}.</p>}
    <p>Data da loja: {value.localDate.split('-').reverse().join('/')} · Fuso: {value.timezone}.</p>
  </div>;
}
export function ActivityCard({ activity, merchant }: { activity: ActivityView; merchant: boolean }) {
  return <article className={`stores-card ${styles.activityCard}`}><div className={styles.cardHeading}>
    {activity.sticker && <Image className={styles.cardSticker} src={`/assets/${activity.sticker}.svg`} alt="" aria-hidden="true" width={170} height={150} />}
    <h3>{activity.name}</h3></div>
    {activity.category && <p className="stores-muted">{activity.category}</p>}<Rule activity={activity} />
    {activity.archivedAt && <StatusBadge tone="info" text="Arquivada" />}<Availability value={activity.availability} />
    <Link className="stores-link" href={activityPath(activity.storeId, activity.id)}>{merchant ? 'Gerenciar atividade' : 'Ver atividade'}<span className={styles.srOnly}>: {activity.name}</span></Link>
  </article>;
}
export function SubmissionCard({ submission, merchant }: { submission: SubmissionView; merchant: boolean }) {
  const activity = submission.snapshot ?? submission.activity;
  return <article className="stores-card"><h3>{activity.name}</h3>{merchant && <p>{submission.participant.displayName || 'Participante'}</p>}
    <SubmissionBadges submission={submission} />
    <p>{points(activity.points)} pontos da ocasião</p>
    {submission.receivedAt && <p><time dateTime={submission.receivedAt}>{localTime(submission.receivedAt, submission.timezone || 'UTC')}</time> · {submission.timezone}</p>}
    <Link className="stores-link" href={`/lojas/${submission.storeId}/registros/${submission.id}`}>Abrir registro<span className={styles.srOnly}> de {activity.name}</span></Link>
  </article>;
}
export function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  return <nav className="stores-pagination" aria-label="Páginas de resultados"><Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anteriores</Button>
    <span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))}</span><Button variant="secondary" disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>Próximos</Button></nav>;
}
