'use client';

import Link from 'next/link';
import type { SubmissionView } from '@/contracts/activities';
import type { StoreView } from '@/contracts/stores';
import { useResource, storeError } from '@/components/stores/store-api';
import { MediaUploader } from '@/components/media/media-uploader';
import { ConversationPanel } from '@/components/conversation/conversation-panel';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Rule, localTime, points } from './activity-display';
import { activityPath, base } from './transport';
import styles from './activities.module.css';

export function SubmissionContent({ store, accountKey, submission }: { store: StoreView; accountKey: string; submission: SubmissionView }) {
  if (submission.status === 'DRAFT') return <section className="stores-card"><h2>Conquista em preparação</h2><p>Este rascunho ainda não ocupa um registro nem libera pontos.</p>
    <Link className="primary-link" href={`${activityPath(store.id, submission.activityId)}/registrar?rascunho=${encodeURIComponent(submission.id)}`}>Continuar preparando conquista</Link></section>;
  const activity = submission.snapshot!;
  return <>
    <section className="stores-card"><Link className="stores-link" href={activityPath(store.id)}>Voltar às atividades</Link><h2>{activity.name}</h2>
      <StatusBadge tone={submission.status === 'APPROVED' ? 'success' : 'pending'} text={submission.status === 'APPROVED' ? 'Aprovado automaticamente' : 'Aguardando aprovação'} />
      <p role="status">{submission.pointsState === 'CREDITED' ? `Conquista registrada! +${points(activity.points)} pontos confirmados nesta loja.` :
        `Conquista enviada! Seus ${points(activity.points)} pontos aguardam aprovação e ainda não estão disponíveis.`}</p>
      {store.role === 'MERCHANT' && <p>Participante: {submission.participant.displayName || 'Pessoa participante'}</p>}
      <Rule activity={activity} /><p className={styles.text}>{activity.description}</p>
      <dl className="stores-details"><div><dt>Situação dos pontos</dt><dd>{submission.pointsState === 'CREDITED' ? 'Crédito confirmado' : 'Em análise'}</dd></div>
        {submission.receivedAt && <div><dt>Envio recebido</dt><dd><time dateTime={submission.receivedAt}>{localTime(submission.receivedAt, submission.timezone || 'UTC')}</time> · {submission.timezone}</dd></div>}
        {submission.approvedAt && <div><dt>Aprovação automática</dt><dd><time dateTime={submission.approvedAt}>{localTime(submission.approvedAt, submission.timezone || 'UTC')}</time></dd></div>}</dl>
      <p>Os pontos e a regra acima são da ocasião do envio. Mudanças na atividade não alteram esta conquista.</p>
      <h3>Legenda</h3><p className={styles.text}>{submission.caption || 'Este registro foi enviado sem legenda.'}</p>
      <p>Este registro fica entre o participante e quem gerencia esta loja.</p>
    </section>
    {submission.evidenceAssetId ? <MediaUploader accountKey={accountKey} storeId={store.id} collectionId={submission.collectionId} /> : <p>Este registro foi enviado sem foto.</p>}
    {submission.conversation && <ConversationPanel accountKey={accountKey} storeId={store.id} conversationId={submission.conversation.id} />}
  </>;
}
export function SubmissionDetail({ store, accountKey, submissionId }: { store: StoreView; accountKey: string; submissionId: string }) {
  const { data, loading, error, reload } = useResource<SubmissionView>(`${base(store.id)}/registros/${encodeURIComponent(submissionId)}`);
  if (loading) return <p role="status">Abrindo conquista…</p>;
  if (error || !data) return <section className="stores-card"><h2>Registro indisponível</h2><p role="alert">{storeError(error)}</p><Button variant="secondary" onClick={reload}>Tentar carregar novamente</Button></section>;
  return <SubmissionContent store={store} accountKey={accountKey} submission={data} />;
}
