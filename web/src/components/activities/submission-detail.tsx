'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import type { SubmissionView } from '@/contracts/activities';
import type { StoreView } from '@/contracts/stores';
import { useResource, storeError } from '@/components/stores/store-api';
import { MediaUploader } from '@/components/media/media-uploader';
import { ConversationPanel } from '@/components/conversation/conversation-panel';
import { Button } from '@/components/ui/button';
import { ReviewPanel } from '@/components/submissions/review-panel';
import { ResponsePanel } from '@/components/submissions/response-panel';
import { SubmissionTimeline } from '@/components/submissions/submission-history';
import { SubmissionBadges } from '@/components/submissions/review-display';
import { Rule, localTime, points } from './activity-display';
import { activityPath, base } from './transport';
import styles from './activities.module.css';

export function SubmissionContent({ store, accountKey, submission: initial, eventId, returnTo }: {
  store: StoreView; accountKey: string; submission: SubmissionView; eventId?: string; returnTo?: string;
}) {
  const [submission, setSubmission] = useState(initial);
  const [denied, setDenied] = useState(false);
  const unavailable = useCallback(() => setDenied(true), []);
  if (denied) return <section className="stores-card"><h2>Acesso indisponível</h2><p role="alert">Este registro não está disponível para sua conta.</p></section>;
  if (submission.status === 'DRAFT') return <section className="stores-card"><h2>Conquista em preparação</h2><p>Este rascunho ainda não ocupa um registro nem libera pontos.</p>
    <Link className="primary-link" href={`${activityPath(store.id, submission.activityId)}/registrar?rascunho=${encodeURIComponent(submission.id)}`}>Continuar preparando conquista</Link></section>;
  const activity = submission.snapshot!;
  const approval = submission.analysis?.approval;
  return <>
    <section className="stores-card">{returnTo ? <Link className="stores-link" href={returnTo}>{returnTo.split('?')[0].endsWith('/mural') ? 'Voltar ao mural com os filtros' : 'Voltar ao extrato com os filtros'}</Link> :
      <Link className="stores-link" href={activityPath(store.id)}>Voltar às atividades</Link>}<h2>{activity.name}</h2>
      <SubmissionBadges submission={submission} />
      {submission.status === 'PENDING' && <p role="status">Conquista enviada! Seus {points(activity.points)} pontos aguardam aprovação e ainda não estão disponíveis.</p>}
      {submission.status === 'APPROVED' && <p role="status">{approval?.mode === 'MANUAL' ? `Registro aprovado. ${points(activity.points)} pontos confirmados nesta loja.` : `Conquista registrada! +${points(activity.points)} pontos confirmados nesta loja.`}</p>}
      {submission.status === 'CONTESTED' && <p role="status">{submission.pointsState === 'CREDITED' ? 'Os pontos continuam contabilizados até a decisão.' : 'Este registro está em contestação. Nenhum ponto deste registro está disponível.'}</p>}
      {submission.status === 'VOIDED' && <p role="status">Este registro foi anulado. Veja o motivo e o ajuste de pontos no histórico.</p>}
      {submission.analysis?.lastReason && <p className={styles.text}><strong>Motivo da última decisão:</strong> {submission.analysis.lastReason}</p>}
      {store.role === 'MERCHANT' && <p>Participante: {submission.participant.displayName || 'Pessoa participante'}</p>}
      <Rule activity={activity} /><p className={styles.text}>{activity.description}</p>
      <dl className="stores-details">
        {submission.receivedAt && <div><dt>Envio recebido</dt><dd><time dateTime={submission.receivedAt}>{localTime(submission.receivedAt, submission.timezone || 'UTC')}</time> · {submission.timezone}</dd></div>}
        {approval && <div><dt>{approval.mode === 'MANUAL' ? 'Última aprovação manual' : 'Aprovação automática'}</dt><dd><time dateTime={approval.at}>{localTime(approval.at, submission.timezone || 'UTC')}</time> · {approval.author.displayName || 'Pessoa da relação'}</dd></div>}</dl>
      <p>Os pontos e a regra acima são da ocasião do envio. Mudanças na atividade não alteram esta conquista.</p>
      <h3>Legenda</h3><p className={styles.text}>{submission.caption || 'Este registro foi enviado sem legenda.'}</p>
      <p>Este registro fica entre o participante e quem gerencia esta loja.</p>
    </section>
    {store.role === 'MERCHANT' && <ReviewPanel submission={submission} onUpdate={setSubmission} onUnavailable={unavailable} />}
    {store.role === 'PARTICIPANT' && <ResponsePanel submission={submission} accountKey={accountKey} onUpdate={setSubmission} onUnavailable={unavailable} />}
    {!submission.analysis?.canRespond && (submission.evidenceAssetId || (submission.analysis?.evidenceRevision ?? 1) > 1) ?
      <MediaUploader accountKey={accountKey} storeId={store.id} collectionId={submission.collectionId} /> :
      !submission.evidenceAssetId && !submission.analysis?.canRespond && <p>Este registro foi enviado sem foto.</p>}
    <SubmissionTimeline storeId={store.id} submissionId={submission.id} timezone={submission.timezone || store.timezone}
      version={submission.analysis?.version ?? 0} eventId={eventId} onUnavailable={unavailable} />
    {submission.conversation && <ConversationPanel accountKey={accountKey} storeId={store.id} conversationId={submission.conversation.id} />}
  </>;
}
export function SubmissionDetail({ store, accountKey, submissionId, eventId, returnTo }: {
  store: StoreView; accountKey: string; submissionId: string; eventId?: string; returnTo?: string;
}) {
  const { data, loading, error, reload } = useResource<SubmissionView>(`${base(store.id)}/registros/${encodeURIComponent(submissionId)}`);
  if (loading) return <p role="status">Abrindo conquista…</p>;
  if (error || !data) return <section className="stores-card"><h2>Registro indisponível</h2><p role="alert">{storeError(error)}</p><Button variant="secondary" onClick={reload}>Tentar carregar novamente</Button></section>;
  return <SubmissionContent key={`${data.id}:${data.analysis?.version ?? 0}`} store={store} accountKey={accountKey} submission={data} eventId={eventId} returnTo={returnTo} />;
}
