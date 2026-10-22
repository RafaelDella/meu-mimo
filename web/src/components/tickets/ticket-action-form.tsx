'use client';

import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { TicketAction, TicketView } from '@/contracts/redemptions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { points } from '@/components/activities/format';
import { confirmationLabels } from './action-labels';
import styles from './tickets.module.css';

export type TicketDraft = { text: string; agreementDate: string; restock: boolean };
function validDate(value: string) { const date = new Date(`${value}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
export function TicketActionForm({ ticket, action, draft, onDraft, busy, locked, onConfirm }: {
  ticket: TicketView; action: TicketAction; draft: TicketDraft; onDraft: (draft: TicketDraft) => void;
  busy: boolean; locked: boolean; onConfirm: (draft: TicketDraft) => void;
}) {
  const id = useId();
  const textField = useRef<HTMLTextAreaElement>(null);
  const dateField = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<{ text?: string; date?: string }>({});
  const textLabel = action === 'AGREE' ? 'Combinado' : action === 'REQUEST_CANCELLATION' ? 'Motivo do pedido' : action === 'REJECT_CANCELLATION' ? 'Motivo da recusa' : 'Motivo do cancelamento';
  const impact = ticket.cancellationImpact;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || locked) return;
    const text = draft.text.trim(); const next: typeof errors = {};
    if (action !== 'FULFILL' && (!text || Array.from(text).length > 500 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))) next.text = 'Escreva de 1 a 500 caracteres Unicode.';
    if (action === 'AGREE' && draft.agreementDate && !validDate(draft.agreementDate)) next.date = 'Informe uma data válida ou deixe sem data.';
    setErrors(next);
    if (next.text) { textField.current?.focus(); return; }
    if (next.date) { dateField.current?.focus(); return; }
    onConfirm({ ...draft, text });
  }
  return <form className={styles.form} onSubmit={submit} noValidate aria-busy={busy}>
    {ticket.pendingCancellation && <div><h3>Pedido em análise</h3><p className={styles.text}>{ticket.pendingCancellation.text}</p></div>}
    {action === 'FULFILL' ? <p>Confirma que este mimo já foi realizado? Isso encerra o ticket e não desconta pontos novamente.</p> : <>
      <label className="stores-field" htmlFor={`${id}-text`}>{textLabel}</label>
      <textarea ref={textField} id={`${id}-text`} value={draft.text} rows={4} required disabled={busy} readOnly={locked}
        aria-invalid={errors.text ? true : undefined} aria-describedby={`${id}-hint${errors.text ? ` ${id}-error` : ''}`}
        onChange={event => { setErrors(current => ({ ...current, text: undefined })); onDraft({ ...draft, text: event.target.value }); }} />
      <p id={`${id}-hint`}>{Array.from(draft.text).length} de 500 caracteres Unicode. Texto privado entre as pessoas desta relação.</p>
      <p id={`${id}-error`} role="alert">{errors.text}</p></>}
    {action === 'AGREE' && <Input ref={dateField} label="Data do combinado" type="date" value={draft.agreementDate} readOnly={locked} disabled={busy} error={errors.date}
      hint={`Opcional, sem horário, no fuso ${ticket.timezone}. Deixar em branco remove a data anterior. Datas passadas são permitidas.`}
      onChange={event => { setErrors(current => ({ ...current, date: undefined })); onDraft({ ...draft, agreementDate: event.target.value }); }} />}
    {action === 'REQUEST_CANCELLATION' && <p>Os pontos permanecem no resgate até a decisão. Enquanto o pedido estiver em análise, o mimo não poderá ser marcado como realizado.</p>}
    {action === 'REJECT_CANCELLATION' && <p>A recusa mantém os pontos e restaura o estado anterior ao pedido.</p>}
    {action === 'CANCEL' && impact && <><dl className="stores-details"><div><dt>Pontos a devolver</dt><dd>{points(impact.refund)} pontos da ocasião</dd></div>
      <div><dt>Saldo atual da pessoa participante</dt><dd>{points(impact.balanceBefore)} pontos</dd></div><div><dt>Saldo após a devolução</dt><dd>{points(impact.balanceAfter)} pontos</dd></div></dl>
      {impact.restock.eligible ? <><label className={styles.choice}><input type="checkbox" checked={draft.restock} disabled={busy || locked}
        onChange={event => onDraft({ ...draft, restock: event.target.checked })} />Repor uma unidade no estoque</label>
        <p>Estoque atual: {impact.restock.stock}. {draft.restock ? `Após a reposição: ${(impact.restock.stock ?? 0) + 1}.` : 'O estoque será mantido.'} Isso preserva a disponibilidade e o arquivamento do catálogo.</p></> :
        <p>Reposição indisponível para este ticket ou para o estoque atual. O cancelamento pode devolver os pontos sem reposição.</p>}
      <p>A devolução usa o custo preservado no vale. Cancelamento e devolução serão confirmados juntos uma única vez.</p></>}
    <Button type="submit" disabled={busy || locked || (action === 'CANCEL' && !impact)}>{busy ? 'Confirmando…' : confirmationLabels[action]}</Button>
  </form>;
}
