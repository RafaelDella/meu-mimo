'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ActivityView, SubmissionView } from '@/contracts/activities';
import type { StoreView } from '@/contracts/stores';
import { MediaUploader } from '@/components/media/media-uploader';
import type { MediaSelectionState } from '@/components/media/media-uploader';
import { Button } from '@/components/ui/button';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { Availability, Rule, localTime } from './activity-display';
import { SubmissionContent } from './submission-detail';
import { activityApi, activityPath, privacyError } from './transport';
import type { SubmissionBody } from './transport';
import styles from './activities.module.css';

const reviewErrors = ['activity_changed', 'period_changed', 'timezone_changed'];
function expiredSession(cause: unknown) { return cause instanceof StoreRequestError && cause.status === 401; }
export function SubmissionForm({ store, accountKey, activity, draftId }: { store: StoreView; accountKey: string; activity: ActivityView; draftId?: string }) {
  const fieldId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const captionField = useRef<HTMLTextAreaElement>(null);
  const operationId = useRef(draftId ?? '');
  const pending = useRef<SubmissionBody | null>(null);
  const active = useRef<AbortController | null>(null);
  const [generation, setGeneration] = useState(0);
  const [draft, setDraft] = useState<SubmissionView>();
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(true);
  const [denied, setDenied] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [media, setMedia] = useState<MediaSelectionState>({ ready: false, busy: false, selectedCount: 0, assetIds: [], unavailable: true });
  const selectionChanged = useCallback((state: MediaSelectionState) => { setMedia(state); }, []);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    operationId.current ||= crypto.randomUUID();
    const id = operationId.current;
    const address = new URL(window.location.href); address.searchParams.set('rascunho', id);
    window.history.replaceState(null, '', `${address.pathname}${address.search}`);
    void (async () => {
      try {
        let value: SubmissionView;
        try { value = await activityApi.submission(store.id, id, controller.signal); }
        catch (cause) {
          if (!(cause instanceof StoreRequestError && cause.status === 404)) throw cause;
          if (store.platformPausedAt) throw new StoreRequestError('store_platform_paused', 409, 'Novas conquistas estão pausadas pela plataforma.');
          value = await activityApi.prepare(store.id, activity.id, id, controller.signal);
        }
        if (value.activityId !== activity.id || value.storeId !== store.id) throw new StoreRequestError('resource_not_found', 404, 'Conteúdo indisponível.');
        if (!controller.signal.aborted) { setDraft(value); setError(''); }
      } catch (cause) { if (!controller.signal.aborted) {
        setError(storeError(cause));
        if (expiredSession(cause)) window.dispatchEvent(new Event('meumimo:session-changed'));
        else if (privacyError(cause)) setDenied(true);
      } }
      finally { if (!controller.signal.aborted) { active.current = null; setPreparing(false); } }
    })();
    return () => controller.abort();
  }, [store.id, store.platformPausedAt, activity.id, draftId, generation]);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { if (draft && draft.status !== 'DRAFT') title.current?.focus(); }, [draft]);
  function recover(cause: unknown) {
    if (expiredSession(cause)) {
      setDraft(undefined); setCaption(''); pending.current = null; setUncertain(false);
      window.dispatchEvent(new Event('meumimo:session-changed'));
    } else if (privacyError(cause)) { setDenied(true); setDraft(undefined); setCaption(''); pending.current = null; }
    else if (cause instanceof StoreRequestError && cause.status === 409 && reviewErrors.includes(cause.code)) {
      pending.current = null; setUncertain(false); setNeedsReview(true);
    } else if (cause instanceof StoreRequestError && ['media_not_ready', 'activity_limit_reached', 'activity_archived', 'store_paused', 'store_platform_paused', 'store_closed', 'membership_closed'].includes(cause.code)) {
      pending.current = null; setUncertain(false);
    } else if (cause instanceof StoreRequestError && cause.status === 400 && !uncertain) { pending.current = null; setUncertain(false); }
    else setUncertain(true);
    setError(storeError(cause)); title.current?.focus();
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || active.current || needsReview) return;
    if (!pending.current) {
      if ([...caption.trim()].length > 500) { setError('Use até 500 caracteres na legenda.'); captionField.current?.focus(); return; }
      if (!media.ready || media.busy || media.unavailable) { setError('Prepare a foto selecionada ou remova-a antes de enviar a conquista.'); title.current?.focus(); return; }
      if (!draft.review) { setNeedsReview(true); return; }
      pending.current = { caption: caption.trim(), evidenceAssetId: media.assetIds[0] ?? null,
        expectedVersion: draft.review.expectedVersion, expectedLocalDate: draft.review.localDate, expectedTimezone: draft.review.timezone };
    }
    const body = pending.current;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError(''); setMessage('');
    try {
      if (uncertain) {
        const found = await activityApi.submission(store.id, draft.id, controller.signal);
        if (controller.signal.aborted) return;
        if (found.status !== 'DRAFT') { setDraft(found); setUncertain(false); pending.current = null; title.current?.focus(); return; }
      }
      if (store.platformPausedAt) { setError('Novos registros estão pausados pela plataforma. O rascunho permanece nesta tela.'); return; }
      const result = await activityApi.send(store.id, draft.id, body, controller.signal);
      if (!controller.signal.aborted) { setDraft(result); pending.current = null; setUncertain(false); title.current?.focus(); }
    } catch (cause) { if (!controller.signal.aborted) recover(cause); }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  async function review() {
    if (!draft || active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const next = await activityApi.submission(store.id, draft.id, controller.signal);
      if (!controller.signal.aborted) { setDraft(next); setNeedsReview(false); setMessage('Regras e data atualizadas. Revise os detalhes antes de confirmar.'); title.current?.focus(); }
    } catch (cause) { if (!controller.signal.aborted) recover(cause); }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  if (denied) return <section className="stores-card"><h2>Acesso indisponível</h2><p role="alert">Esta conquista não está disponível para sua conta.</p></section>;
  if (store.role !== 'PARTICIPANT') return <section className="stores-card"><h2>Registro de participante</h2><p>Quem gerencia a loja pode cuidar das atividades, mas não pontua na própria loja.</p></section>;
  if (draft && draft.status !== 'DRAFT') return <><h2 ref={title} tabIndex={-1}>Envio confirmado</h2><SubmissionContent store={store} accountKey={accountKey} submission={draft} />
    <Link className="primary-link" href={`/lojas/${store.id}/registros/${draft.id}`}>Abrir conquista confirmada</Link></>;
  const currentActivity = draft?.activity ?? activity;
  const locked = busy || uncertain || !!store.platformPausedAt;
  return <section><Link className="stores-link" href={activityPath(store.id, activity.id)}>Voltar à atividade</Link>
    <h2 ref={title} tabIndex={-1}>Registrar conquista</h2><h3>{currentActivity.name}</h3><Rule activity={currentActivity} /><Availability value={currentActivity.availability} />
    <p role="status" aria-live="polite">{preparing ? 'Preparando sua conquista…' : busy ? 'Consultando a confirmação…' : message}</p><p role="alert" className="stores-error">{error}</p>
    {!draft && !preparing && <Button variant="secondary" onClick={() => { setPreparing(true); setGeneration(value => value + 1); }}>Tentar preparar novamente</Button>}
    {draft && <>
      <form className="stores-form" onSubmit={send} aria-busy={busy}>
        <label className="stores-field" htmlFor={fieldId}>Legenda (opcional)<textarea id={fieldId} ref={captionField} className="ui-input" value={caption} rows={4}
          readOnly={locked} aria-describedby={`${fieldId}-hint`} aria-invalid={[...caption.trim()].length > 500 || undefined} onChange={event => setCaption(event.target.value)} /></label>
        <p id={`${fieldId}-hint`}>{[...caption.trim()].length} de 500 caracteres. A legenda ficará no histórico como foi enviada.</p>
        <div inert={busy || uncertain}><MediaUploader accountKey={accountKey} storeId={store.id} collectionId={draft.collectionId} onSelectionChange={selectionChanged} readOnly={!!store.platformPausedAt} /></div>
        <div className={styles.review}><h3>Confira antes de enviar</h3><Rule activity={currentActivity} />
          {draft.review && <><p>Data prevista do registro: {draft.review.localDate.split('-').reverse().join('/')} · {draft.review.timezone}.</p>
            <p>Última consulta: {localTime(draft.review.now, draft.review.timezone)}. A data efetiva será confirmada pelo servidor; não há registro retroativo.</p></>}
          <p>{media.selectedCount === 0 ? 'Você escolheu enviar sem foto.' : media.ready ? 'Sua foto está pronta e será anexada à conquista.' : 'A foto selecionada precisa terminar o envio e o processamento. Atualize os arquivos para conferir, ou remova a seleção para continuar sem foto.'}</p>
          <p>Este registro fica entre você e quem gerencia esta loja.</p></div>
        {needsReview && <p role="status">A regra, a data ou o fuso mudou. Revise os dados atuais antes de confirmar novamente.</p>}
        {needsReview && <Button variant="secondary" disabled={busy} onClick={() => { void review(); }}>Revisar regras e data</Button>}
        {uncertain && <p role="status">O resultado ainda não foi confirmado. Consultaremos o mesmo registro antes de repetir o envio. Sua legenda e sua foto ficam preservadas.</p>}
        <Button type="submit" disabled={busy || needsReview || (!uncertain && (!!store.platformPausedAt || !currentActivity.availability?.eligible || !media.ready || media.busy || media.unavailable || [...caption.trim()].length > 500))}>
          {busy ? 'Confirmando…' : uncertain ? 'Consultar envio' : 'Enviar registro'}</Button>
      </form>
    </>}
  </section>;
}
