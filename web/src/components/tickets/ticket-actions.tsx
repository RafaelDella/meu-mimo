'use client';

import { useEffect, useRef } from 'react';
import type { TicketView } from '@/contracts/redemptions';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TicketActionForm } from './ticket-action-form';
import { actionLabels } from './action-labels';
import { useTicketTransition } from './use-ticket-transition';
import styles from './tickets.module.css';

export function TicketActions({ ticket, onUpdate }: { ticket: TicketView; onUpdate: (ticket: TicketView) => void }) {
  const trigger = useRef<HTMLElement | null>(null);
  const result = useRef<HTMLParagraphElement>(null);
  const control = useTicketTransition(ticket, onUpdate);
  useEffect(() => { if (control.notice && !control.action) result.current?.focus(); }, [control.notice, control.action]);
  useEffect(() => { if (control.stage === 'review') result.current?.focus(); }, [control.stage]);
  return <section className={`stores-card ${styles.area}`} aria-label="Tratamento do ticket">
    <h3>Próximos passos</h3>
    <p role="status" ref={result} tabIndex={-1}>{control.notice || (control.stage === 'review' ? 'O estado ou o impacto mudou. Consulte a situação atual antes de confirmar outra ação.' : '')}</p>
    <p role="alert">{control.error}</p>
    {control.stage === 'uncertain' ? <><p>O resultado ainda não foi confirmado. Sua intenção está preservada. Consulte o resultado antes de repetir.</p>
      <Button variant="secondary" disabled={control.busy} onClick={() => { void control.inspect(); }}>Consultar resultado da operação</Button></> : control.stage === 'review' ?
      <Button variant="secondary" disabled={control.busy} onClick={() => { void control.review(); }}>Consultar estado atual para revisão</Button> :
      <div className={styles.actions}>{ticket.actions.map(action => <Button key={action} variant={action === 'CANCEL' ? 'secondary' : 'primary'} disabled={control.busy}
        onClick={event => { trigger.current = event.currentTarget; control.begin(action); }}>{action === 'AGREE' && ticket.agreementText ? 'Revisar combinado' : actionLabels[action]}</Button>)}</div>}
    {!ticket.actions.length && control.stage === 'idle' && <p>{ticket.status === 'CANCELLATION_REQUESTED' ? 'Seu pedido aguarda a decisão de quem gerencia a loja. A realização está bloqueada durante a análise.' :
      ['FULFILLED', 'CANCELLED'].includes(ticket.status) ? 'Este ticket está encerrado. O vale, o histórico e a conversa continuam disponíveis.' : 'Nenhuma ação disponível para esta conta neste momento.'}</p>}
    <Dialog open={!!control.action} title={control.action ? actionLabels[control.action] : 'Tratamento do ticket'} description="Confira os dados deste ticket antes de confirmar." returnFocusRef={trigger}
      onOpenChange={open => { if (!open && !control.busy) control.setAction(null); }}>
      {control.action && <><h3>{ticket.snapshot.name}</h3><p>Ticket {ticket.code}</p><p role="alert">{control.error}</p>
        <TicketActionForm key={control.action} ticket={ticket} action={control.action} draft={control.draft} onDraft={control.setDraft} busy={control.busy}
          locked={control.stage !== 'idle'} onConfirm={value => { void control.confirm(value); }} />
        {control.stage === 'uncertain' && <Button disabled={control.busy} onClick={() => { void control.inspect(); }}>Consultar resultado da operação</Button>}</>}
    </Dialog>
  </section>;
}
