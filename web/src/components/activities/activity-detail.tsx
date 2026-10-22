'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ActivityView } from '@/contracts/activities';
import type { StoreView } from '@/contracts/stores';
import { StoreRequestError, storeError, useResource } from '@/components/stores/store-api';
import { ConfirmAction } from '@/components/stores/store-controls';
import { Button } from '@/components/ui/button';
import { Availability, Rule } from './activity-display';
import { SubmissionList } from './submission-list';
import { SubmissionForm } from './submission-form';
import { activityApi, activityPath, base, privacyError } from './transport';
import styles from './activities.module.css';

function ArchiveActivity({ storeId, activity, onArchived, onDenied }: { storeId: string; activity: ActivityView; onArchived: () => void; onDenied: () => void }) {
  const active = useRef<AbortController | null>(null);
  const operation = useRef<{ operationId: string; expectedVersion: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => () => active.current?.abort(), []);
  async function archive(close: () => void) {
    if (active.current || conflict) return;
    operation.current ??= { operationId: crypto.randomUUID(), expectedVersion: activity.version };
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      await activityApi.archive(storeId, activity.id, operation.current, controller.signal);
      if (!controller.signal.aborted) { close(); onArchived(); }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (privacyError(cause)) onDenied();
      else if (cause instanceof StoreRequestError && cause.status === 409) { setConflict(true); operation.current = null; }
      else setUncertain(true);
      setError(storeError(cause));
    } finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  return <div className="stores-lifecycle"><ConfirmAction label={uncertain ? 'Consultar arquivamento' : 'Arquivar atividade'} title="Arquivar esta atividade?"
    description="A atividade deixará de aceitar novos registros. As conquistas anteriores, fotos, conversas e pontos continuam no histórico. Esta ação não é uma exclusão."
    confirmLabel={uncertain ? 'Consultar arquivamento' : 'Confirmar arquivamento'} busy={busy} error={error} confirmDisabled={conflict}
    onConfirm={close => { void archive(close); }}>
    {uncertain && <p>Consultaremos o mesmo arquivamento para evitar uma nova operação.</p>}
    {conflict && <p>A atividade mudou. Feche esta confirmação e atualize a atividade para revisar antes de arquivar.</p>}
  </ConfirmAction></div>;
}

export function ActivityDetail({ store, accountKey, activityId, register = false, draftId }: {
  store: StoreView; accountKey: string; activityId: string; register?: boolean; draftId?: string;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const focusAfterLoad = useRef(false);
  const [denied, setDenied] = useState(false);
  const { data, loading, error, reload } = useResource<ActivityView>(`${base(store.id)}/atividades/${encodeURIComponent(activityId)}`);
  useEffect(() => { if (!loading && focusAfterLoad.current) { focusAfterLoad.current = false; title.current?.focus(); } }, [loading]);
  function refresh() { focusAfterLoad.current = true; reload(); }
  if (denied) return <section className="stores-card"><h2>Acesso indisponível</h2><p role="alert">Esta atividade não está disponível para sua conta.</p></section>;
  if (loading) return <p role="status">Abrindo atividade…</p>;
  if (error || !data) return <section className="stores-card"><h2>Atividade indisponível</h2><p role="alert">{storeError(error)}</p><Button variant="secondary" onClick={refresh}>Tentar carregar novamente</Button></section>;
  if (register) {
    if (store.role !== 'PARTICIPANT') return <section className="stores-card"><h2>Registro de participante</h2><p>Quem gerencia esta loja pode cuidar das atividades, mas não pontua na própria loja.</p></section>;
    if (!draftId && !data.availability?.eligible) return <section className="stores-card"><h2 ref={title} tabIndex={-1}>{data.name}</h2><Availability value={data.availability} /><Link className="stores-link" href={activityPath(store.id)}>Voltar às atividades</Link></section>;
    return <SubmissionForm store={store} accountKey={accountKey} activity={data} draftId={draftId} />;
  }
  return <>
    <section className="stores-card"><Link className="stores-link" href={activityPath(store.id)}>Voltar às atividades</Link><h2 ref={title} tabIndex={-1}>{data.name}</h2>
      {data.category && <p className="stores-muted">{data.category}</p>}<p className={styles.text}>{data.description || 'Esta atividade ainda não tem uma descrição.'}</p>
      <Rule activity={data} /><Availability value={data.availability} />
      {data.archivedAt && <p className="stores-banner">Atividade arquivada. As conquistas anteriores continuam no histórico.</p>}
      {store.role === 'MERCHANT' ? <>
        {!data.archivedAt && store.state !== 'CLOSED' && <Link className="primary-link" href={`${activityPath(store.id, activityId)}/editar`}>Editar atividade</Link>}
        {!data.archivedAt && store.state !== 'CLOSED' && <ArchiveActivity key={`${data.id}:${data.version}`} storeId={store.id} activity={data} onArchived={refresh} onDenied={() => setDenied(true)} />}
      </> : data.availability?.eligible && <Link className="primary-link" href={`${activityPath(store.id, activityId)}/registrar`}>Registrar conquista</Link>}
      <div className="stores-actions"><Button variant="secondary" onClick={refresh}>Atualizar atividade</Button></div>
    </section>
    <SubmissionList store={store} activityId={activityId} compact />
  </>;
}
