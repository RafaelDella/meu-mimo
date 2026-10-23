'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { AdminAccountView, AdminActionKind, AdminActionResult, AdminStoreDetail, AdminTargetRef } from '@/contracts/admin';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { storeError } from '@/components/stores/store-api';
import { adminRequest, useAdminAccess } from './transport';
import { useAdminAction } from './use-admin-action';
import styles from './admin.module.css';

export type AdminEntity = AdminAccountView | AdminStoreDetail;
export const actionLabels: Record<AdminActionKind, string> = { BLOCK_ACCOUNT: 'Bloquear acesso por segurança', UNBLOCK_ACCOUNT: 'Reativar acesso', PAUSE_STORE: 'Pausar novas ações da loja', RESUME_STORE: 'Retirar pausa da plataforma' };
export function availableAdminAction(entity: AdminEntity): AdminActionKind | null {
  return 'suspendedAt' in entity ? entity.suspendedAt ? 'UNBLOCK_ACCOUNT' : entity.canBlock ? 'BLOCK_ACCOUNT' : null : entity.platformPausedAt ? 'RESUME_STORE' : 'PAUSE_STORE';
}
export function AdminActionDialog({ target, initial, action, onClose, onConfirmed, returnFocusRef }: {
  target: AdminTargetRef; initial: AdminEntity; action: AdminActionKind; onClose(): void; onConfirmed(value: AdminActionResult): void; returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const [snapshot, setSnapshot] = useState(initial); const [reason, setReason] = useState(''); const [reviewing, setReviewing] = useState(false); const [reviewError, setReviewError] = useState('');
  const reasonId = useId(); const [reasonError, setReasonError] = useState('');
  const field = useRef<HTMLTextAreaElement>(null); const active = useRef<AbortController | null>(null); const unavailable = useAdminAccess();
  useEffect(() => () => { const controller = active.current; active.current = null; controller?.abort(); }, []);
  const intent = useAdminAction(target, onConfirmed); const normalized = reason.trim().normalize('NFC'); const count = Array.from(normalized).length;
  async function review() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setReviewing(true); setReviewError('');
    try {
      const current = await adminRequest<AdminEntity>(`/api/admin/${target.type === 'ACCOUNT' ? 'contas' : 'lojas'}/${target.id}`, 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) { setSnapshot(current); intent.reviewed(); field.current?.focus(); }
    } catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setReviewError(storeError(cause)); } }
    finally { if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setReviewing(false); } }
  }
  const allowed = availableAdminAction(snapshot) === action; const name = 'displayName' in snapshot ? snapshot.displayName : snapshot.name;
  return <Dialog open onOpenChange={open => { if (!open && !intent.busy && !reviewing) { active.current?.abort(); onClose(); } }} title={actionLabels[action]} returnFocusRef={returnFocusRef}>
    <p>Alvo: <strong>{name || (target.type === 'ACCOUNT' ? 'Conta' : 'Loja')}</strong></p><p>UUID: {target.id} · Revisão {snapshot.version}.</p>
    {'suspendedAt' in snapshot ? <p>{action === 'BLOCK_ACCOUNT' ? 'Este bloqueio retira também a leitura privada da própria conta em todas as lojas. Não encerra vínculos nem altera pontos, tickets, senha ou fatores.' : 'Reativar o acesso preserva sessões revogadas, fatores e restrições das lojas. Uma sessão válida continua necessária.'}</p> :
      <><p>Estado mantido pelo lojista: {snapshot.state === 'PAUSED' ? 'Pausado' : snapshot.state === 'CLOSED' ? 'Encerrado' : 'Ativo'}. Pausa da plataforma: {snapshot.platformPausedAt ? 'Aplicada' : 'Não aplicada'}.</p>
        <p>{action === 'PAUSE_STORE' ? 'A plataforma impedirá novos convites, registros, resgates e evidências de novas conquistas. Análise, tickets e demais obrigações existentes continuam acessíveis.' : 'Retirar esta causa não desfaz a pausa do lojista, encerramentos ou revogações.'}</p></>}
    <form className={styles.stack} onSubmit={event => {
      event.preventDefault();
      if (intent.uncertain) { void intent.send(); return; }
      if (!count || count > 500) { setReasonError(!count ? 'Informe o motivo administrativo.' : 'Use até 500 caracteres Unicode no motivo.'); field.current?.focus(); return; }
      if (!allowed || intent.reviewRequired) return;
      void intent.send({ operationId: crypto.randomUUID(), target, action, expectedVersion: snapshot.version, reason: normalized });
    }}>
      <label className={styles.field} htmlFor={reasonId}>Motivo administrativo</label>
      <textarea className="ui-input" id={reasonId} ref={field} rows={5} value={reason} readOnly={intent.busy || intent.uncertain || reviewing} aria-invalid={!!reasonError || count > 500 || undefined} aria-describedby={`${reasonId}-hint ${reasonId}-error`} onChange={event => { setReason(event.target.value); setReasonError(''); }} />
      <p id={`${reasonId}-hint`}>{count} de 500 caracteres Unicode. O motivo fica na auditoria administrativa.</p>
      <p id={`${reasonId}-error`} role="alert">{reasonError || intent.error || reviewError}</p>
      {intent.reviewRequired && <Button variant="secondary" disabled={reviewing} onClick={() => void review()}>{reviewing ? 'Revisando…' : 'Revisar estado atual'}</Button>}
      {!allowed && <p role="status">A ação já não corresponde ao estado atual. Feche a confirmação e revise o alvo.</p>}
      {intent.uncertain && <p>O resultado ainda não foi confirmado. Consulte a mesma operação antes de continuar.</p>}
      <Button type="submit" disabled={intent.busy || reviewing || (!intent.uncertain && (intent.reviewRequired || !allowed))}>{intent.busy ? 'Conferindo operação…' : intent.uncertain ? 'Consultar operação administrativa' : 'Confirmar ação administrativa'}</Button>
    </form>
  </Dialog>;
}
