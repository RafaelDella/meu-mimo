import type { ReviewAction, ReviewEventView, SubmissionView } from '@/contracts/activities';
import { StatusBadge } from '@/components/ui/status-badge';
import { localTime, points } from '@/components/activities/format';
import styles from './submissions.module.css';

export function statusText(submission: SubmissionView) {
  if (submission.status === 'APPROVED') return submission.analysis?.approval?.mode === 'MANUAL' ? 'Aprovado manualmente' : 'Aprovado automaticamente';
  return { DRAFT: 'Em preparação', PENDING: 'Aguardando aprovação', CONTESTED: 'Em contestação', VOIDED: 'Anulado' }[submission.status];
}
export function pointsText(submission: SubmissionView) {
  return { NONE: 'Sem crédito', PENDING: 'Pontos em análise', CREDITED: 'Crédito confirmado', REVERSED: 'Crédito estornado' }[submission.pointsState];
}
export function SubmissionBadges({ submission }: { submission: SubmissionView }) {
  return <><StatusBadge tone={submission.status === 'APPROVED' ? 'success' : submission.status === 'VOIDED' ? 'error' : 'pending'} text={statusText(submission)} />
    <p><strong>Situação dos pontos:</strong> {pointsText(submission)}</p></>;
}
export function actionText(action: ReviewAction, submission: SubmissionView) {
  return action === 'APPROVE' ? submission.pointsState === 'CREDITED' ? 'Manter aprovação' : 'Aprovar registro' :
    action === 'CONTEST' ? submission.status === 'CONTESTED' ? 'Pedir novo complemento' : 'Contestar registro' : action === 'VOID' ? 'Anular registro' : 'Reabrir análise';
}
export function signedPoints(value: string) { return `${BigInt(value) > 0n ? '+' : ''}${points(value)}`; }
export function EventContent({ event, timezone }: { event: ReviewEventView; timezone: string }) {
  const names = { APPROVE: 'Aprovação', CONTEST: 'Contestação e pedido de complemento', VOID: 'Anulação', REOPEN: 'Análise reaberta',
    RESPOND: 'Complemento recebido', RECEIVED: 'Registro recebido', AUTO_APPROVED: 'Aprovação automática' };
  return <><h4>{names[event.kind]}</h4><p>{event.author.displayName || 'Pessoa da relação'} · <time dateTime={event.createdAt}>{localTime(event.createdAt, timezone)}</time> · {timezone}</p>
    {event.reason && <p className={styles.text}><strong>Motivo:</strong> {event.reason}</p>}
    {event.text && <p className={styles.text}><strong>Resposta:</strong> {event.text}</p>}
    {event.evidenceAssetId && <p>Foto preservada na versão {event.evidenceRevision} dos arquivos deste registro.</p>}
    <p>{BigInt(event.delta) === 0n ? 'Esta ação não movimentou pontos.' : `Movimento confirmado: ${signedPoints(event.delta)} pontos.`}</p></>;
}
