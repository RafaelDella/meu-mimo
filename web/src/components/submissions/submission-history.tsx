'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReviewMutation, SubmissionHistory } from '@/contracts/activities';
import { useResource, storeError, StoreRequestError } from '@/components/stores/store-api';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/activities/activity-display';
import { EventContent } from './review-display';
import { reviewApi, submissionBase } from './transport';
import type { ReviewContext } from './transport';
import styles from './submissions.module.css';

export function SubmissionTimeline({ storeId, submissionId, timezone, version, eventId, onUnavailable }: ReviewContext & {
  timezone: string; version: number; eventId?: string; onUnavailable: () => void;
}) {
  const id = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const focusAfterLoad = useRef(false);
  const [page, setPage] = useState(1);
  const [focused, setFocused] = useState<{ eventId: string; data?: ReviewMutation; error?: unknown }>();
  const context = { storeId, submissionId };
  const { data, loading, error, reload } = useResource<SubmissionHistory>(`${submissionBase(context)}/historico?page=${page}&revision=${version}`);
  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    reviewApi.operation({ storeId, submissionId }, eventId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setFocused({ eventId, data: value }); title.current?.focus(); }
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setFocused({ eventId, error: cause });
      if (cause instanceof StoreRequestError && cause.status === 401) window.dispatchEvent(new Event('meumimo:session-changed'));
    });
    return () => controller.abort();
  }, [storeId, submissionId, eventId]);
  useEffect(() => {
    if (!(error instanceof StoreRequestError) || ![401, 403, 404].includes(error.status)) return;
    onUnavailable();
    if (error.status === 401) window.dispatchEvent(new Event('meumimo:session-changed'));
  }, [error, onUnavailable]);
  useEffect(() => {
    if (loading || !focusAfterLoad.current) return;
    focusAfterLoad.current = false; title.current?.focus();
  }, [loading]);
  const current = focused?.eventId === eventId ? focused : undefined;
  return <section className={`stores-card ${styles.panel}`} aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} tabIndex={-1} ref={title}>Histórico deste registro</h3>
    <p>Recebimentos, decisões e complementos permanecem na ordem em que foram confirmados.</p>
    {eventId && !current && <p role="status">Buscando a decisão de origem…</p>}
    {current?.error ? <p role="alert">Não foi possível abrir esta decisão. {storeError(current.error)}</p> : null}
    {current?.data && <article className={styles.focused} aria-label="Decisão de origem"><p>Decisão de origem deste movimento</p>
      <EventContent event={current.data.event} timezone={timezone} /></article>}
    {loading && <p role="status">Consultando o histórico…</p>}
    {error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Consultar histórico novamente</Button></div> : null}
    {data && <>{!data.items.length && <p>Ainda não há eventos neste registro.</p>}
      <ol className={styles.timeline}>{data.items.map(event => <li key={event.id} className={styles.text}><EventContent event={event} timezone={timezone} /></li>)}</ol>
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={next => { focusAfterLoad.current = true; setPage(next); }} /></>}
  </section>;
}
