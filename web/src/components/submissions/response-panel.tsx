'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { SubmissionView } from '@/contracts/activities';
import { MediaUploader } from '@/components/media/media-uploader';
import type { MediaSelectionState } from '@/components/media/media-uploader';
import { Button } from '@/components/ui/button';
import { useReviewOperation } from './use-review-operation';
import styles from './submissions.module.css';

export function ResponsePanel({ submission, accountKey, onUpdate, onUnavailable }: {
  submission: SubmissionView; accountKey: string; onUpdate: (value: SubmissionView) => void; onUnavailable: () => void;
}) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [message, setMessage] = useState('');
  const [media, setMedia] = useState<MediaSelectionState>({ ready: false, busy: false, selectedCount: 0, assetIds: [], unavailable: true });
  const operation = useReviewOperation({ storeId: submission.storeId, submissionId: submission.id }, onUpdate, onUnavailable, () => {
    setText(''); setFieldError(''); setMessage('Complemento confirmado. O registro continua em contestação, sem mudança nos pontos.'); title.current?.focus();
  });
  const selectionChanged = useCallback((value: MediaSelectionState) => setMedia(value), []);
  const analysis = submission.analysis;
  const count = [...text.trim()].length;
  const locked = operation.busy || operation.uncertain;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!analysis?.canRespond || !analysis.requestId) return;
    if (!operation.uncertain) {
      if (count > 500 || (!count && media.selectedCount === 0)) {
        setFieldError(count > 500 ? 'Use até 500 caracteres na resposta.' : 'Escreva uma resposta ou prepare uma foto para complementar.'); field.current?.focus(); return;
      }
      if (!media.ready || media.busy || media.unavailable) { setFieldError('Prepare a foto selecionada ou remova-a antes de confirmar.'); field.current?.focus(); return; }
    }
    setFieldError(''); setMessage('');
    void operation.submit({ kind: 'respond', body: { operationId: crypto.randomUUID(), expectedVersion: analysis.version,
      requestId: analysis.requestId, evidenceRevision: analysis.evidenceRevision, text: text.trim(), evidenceAssetId: media.assetIds[0] ?? null } });
  }
  if (!analysis?.canRespond && !text && !message && !operation.error) return null;
  return <section className={`stores-card ${styles.panel}`} aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} ref={title} tabIndex={-1}>Responder à contestação</h3>
    <p role="status" aria-live="polite">{message}</p>
    {analysis?.canRespond ? <form className="stores-form" onSubmit={submit} aria-busy={operation.busy}>
      <p>Você pode confirmar um complemento para esta solicitação. A legenda e as fotos anteriores continuam no histórico.</p>
      <label htmlFor={`${id}-text`}>Sua resposta à contestação<textarea id={`${id}-text`} ref={field} className="ui-input" rows={4} value={text}
        readOnly={locked} aria-invalid={count > 500 || !!fieldError || undefined} aria-describedby={`${id}-hint ${id}-error`}
        onChange={event => { setText(event.target.value); setFieldError(''); }} /></label>
      <p id={`${id}-hint`}>{count} de 500 caracteres. Envie texto, uma foto ou ambos. Responder não aprova nem libera pontos.</p>
      <div inert={locked}><MediaUploader key={`${analysis.requestId}:${analysis.evidenceRevision}`} accountKey={accountKey} storeId={submission.storeId}
        collectionId={submission.collectionId} onSelectionChange={selectionChanged} /></div>
      <p>{media.selectedCount === 0 ? 'Este complemento está sem foto nova.' : media.ready ? 'Sua foto nova está pronta para confirmação.' : 'A foto nova precisa terminar o envio e o processamento antes da confirmação.'}</p>
      <p id={`${id}-error`} role="alert">{fieldError}</p>
      {operation.error && <p role="alert">{operation.error}</p>}
      {operation.uncertain && <p role="status">O resultado ainda não foi confirmado. Consultaremos o mesmo complemento antes de repetir. Sua resposta e sua foto ficam preservadas.</p>}
      {operation.needsReview && <><p role="status">A análise mudou. Atualize para conferir a solicitação atual antes de confirmar; seu texto foi preservado.</p>
        <Button variant="secondary" disabled={operation.busy} onClick={() => { void operation.refresh(); }}>Atualizar solicitação</Button></>}
      <Button type="submit" disabled={operation.busy || operation.needsReview || (!operation.uncertain && (!media.ready || media.busy || media.unavailable))}>
        {operation.busy ? 'Confirmando complemento…' : operation.uncertain ? 'Consultar complemento' : 'Confirmar complemento'}</Button>
    </form> : <><p>Esta solicitação já foi respondida ou encerrada. Consulte a decisão atual e o histórico.</p>
      {text && <><label htmlFor={`${id}-saved`}>Texto preservado para copiar<textarea id={`${id}-saved`} className="ui-input" value={text} readOnly rows={4} /></label></>}
      {operation.error && <p role="alert">{operation.error}</p>}</>}
  </section>;
}
