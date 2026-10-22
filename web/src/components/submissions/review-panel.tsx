'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ReviewAction, SubmissionView } from '@/contracts/activities';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { points } from '@/components/activities/format';
import { actionText, signedPoints } from './review-display';
import { useReviewOperation } from './use-review-operation';
import styles from './submissions.module.css';

export function ReviewPanel({ submission, onUpdate, onUnavailable }: {
  submission: SubmissionView; onUpdate: (value: SubmissionView) => void; onUnavailable: () => void;
}) {
  const id = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [message, setMessage] = useState('');
  const operation = useReviewOperation({ storeId: submission.storeId, submissionId: submission.id }, onUpdate, onUnavailable, confirmed => {
    setAction(null); setReason(''); setFieldError('');
    setMessage(`Decisão confirmada. ${BigInt(confirmed.event.delta) === 0n ? 'Esta ação não movimentou pontos.' : `Movimento: ${signedPoints(confirmed.event.delta)} pontos.`}`);
  });
  const analysis = submission.analysis;
  const impact = action ? analysis?.impacts[action] : undefined;
  const count = [...reason.trim()].length;
  const invalid = action !== 'APPROVE' && (!count || count > 500);
  useEffect(() => { if (operation.error) field.current?.focus(); }, [operation.error]);
  useEffect(() => { if (action === null && operation.result) title.current?.focus(); }, [action, operation.result]);
  function open(next: ReviewAction, button: HTMLButtonElement) {
    trigger.current = button; operation.clear(); setAction(next); setReason(''); setFieldError(''); setMessage('');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || !analysis || !impact) return;
    if (!operation.uncertain && invalid) {
      setFieldError(!count ? 'Informe o motivo desta decisão.' : 'Use até 500 caracteres no motivo.'); field.current?.focus(); return;
    }
    void operation.submit({ kind: 'review', body: { operationId: crypto.randomUUID(), expectedVersion: analysis.version,
      action, reason: action === 'APPROVE' ? '' : reason.trim(), expectedBalance: impact.available } });
  }
  return <section className="stores-card" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} ref={title} tabIndex={-1}>Análise deste registro</h3>
    <p role="status" aria-live="polite">{message}</p>
    <div className="stores-actions">{analysis?.actions.map(value => <Button key={value} variant="secondary"
      onClick={event => open(value, event.currentTarget)}>{actionText(value, submission)}</Button>)}</div>
    {!analysis?.actions.length && <p>Nenhuma decisão está disponível neste momento. O histórico continua acessível.</p>}
    <Dialog open={action !== null} onOpenChange={next => { if (!next && !operation.busy && !operation.uncertain) setAction(null); }}
      title={action ? `${actionText(action, submission)}?` : 'Analisar registro'} returnFocusRef={trigger}>
      <form className="stores-form" onSubmit={submit} aria-busy={operation.busy}>
        <p>Participante: {submission.participant.displayName || 'Pessoa participante'}. Conquista: {submission.snapshot?.name}.</p>
        {impact && <div className={styles.impact}><h3>Impacto nos pontos desta loja</h3><dl>
          <div><dt>Saldo atual</dt><dd>{points(impact.available)} pontos</dd></div><div><dt>Ajuste desta decisão</dt><dd>{signedPoints(impact.delta)} pontos</dd></div>
          <div><dt>Saldo após confirmar</dt><dd>{points(impact.resulting)} pontos</dd></div></dl>
          {action === 'VOID' && <p>O registro e as decisões anteriores permanecem no histórico. Os tickets já emitidos continuam válidos.</p>}
          {BigInt(impact.resulting) < 0n && <p>O saldo ficará negativo por este ajuste. Novos resgates dependerão de saldo suficiente.</p>}
          {BigInt(impact.delta) === 0n && <p>Esta decisão não adiciona nem remove pontos.</p>}
        </div>}
        {action === 'CONTEST' && <p>O participante poderá responder e complementar a evidência. Um crédito existente continua contabilizado até a decisão.</p>}
        {action === 'REOPEN' && <p>Reabrir volta à análise sem liberar pontos. A recomposição depende de nova aprovação.</p>}
        {action && action !== 'APPROVE' && <><label htmlFor={`${id}-reason`}>Motivo da decisão<textarea className="ui-input" id={`${id}-reason`} ref={field}
          rows={4} value={reason} readOnly={operation.busy || operation.uncertain} aria-invalid={!!fieldError || count > 500 || undefined}
          aria-describedby={`${id}-hint ${id}-error`} onChange={event => { setReason(event.target.value); setFieldError(''); }} /></label>
          <p id={`${id}-hint`}>{count} de 500 caracteres. O motivo será preservado no histórico.</p><p id={`${id}-error`} role="alert">{fieldError}</p></>}
        {operation.error && <p role="alert">{operation.error}</p>}
        {operation.uncertain && <p role="status">O resultado ainda não foi confirmado. Consultaremos a mesma operação antes de repetir, preservando seu motivo.</p>}
        {operation.needsReview && <><p role="status">O registro ou o saldo mudou. Atualize os dados e confira o impacto antes de confirmar novamente. Seu motivo foi preservado.</p>
          <Button variant="secondary" disabled={operation.busy} onClick={() => { void operation.refresh(); }}>Atualizar análise</Button></>}
        <Button type="submit" disabled={operation.busy || operation.needsReview || !action || !analysis?.actions.includes(action) || !impact}>
          {operation.busy ? 'Confirmando decisão…' : operation.uncertain ? 'Consultar decisão' : 'Confirmar decisão'}</Button>
        <Button variant="secondary" disabled={operation.busy || operation.uncertain} onClick={() => setAction(null)}>Voltar sem decidir</Button>
      </form>
    </Dialog>
  </section>;
}
