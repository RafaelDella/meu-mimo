'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AdminActionKind, AdminActionResult, AdminTargetRef } from '@/contracts/admin';
import { Button } from '@/components/ui/button';
import { storeError } from '@/components/stores/store-api';
import { useAdminResource } from './transport';
import { AdminActionDialog, actionLabels, availableAdminAction } from './admin-action-dialog';
import type { AdminEntity } from './admin-action-dialog';
import { recoveryOperation } from './use-admin-action';
import { AdminHistory } from './admin-history';
import { AdminRelations } from './admin-relations';
import { ownerState } from './admin-stores';
import styles from './admin.module.css';

export function AdminDetail({ target }: { target: AdminTargetRef }) {
  const account = target.type === 'ACCOUNT'; const resource = useAdminResource<AdminEntity>(`/api/admin/${account ? 'contas' : 'lojas'}/${target.id}`);
  const [applied, setApplied] = useState<AdminEntity>(); const [notice, setNotice] = useState(''); const [recovering, setRecovering] = useState(recoveryOperation);
  const [confirmation, setConfirmation] = useState<{ snapshot: AdminEntity; action: AdminActionKind }>();
  const trigger = useRef<HTMLElement | null>(null); const title = useRef<HTMLHeadingElement>(null);
  const current = resource.error ? undefined : applied && (!resource.data || applied.version > resource.data.version) ? applied : resource.data;
  useEffect(() => { if (notice && document.activeElement === document.body) title.current?.focus(); }, [notice]);
  function confirmed(value: AdminActionResult) {
    setApplied(value.current); setRecovering(null); setConfirmation(undefined);
    setNotice(value.appliedVersion === value.current.version ? `Ação administrativa confirmada na revisão ${value.appliedVersion}.` : `Operação confirmada na revisão ${value.appliedVersion}. O alvo já está na revisão ${value.current.version}; o estado atual foi preservado.`);
  }
  const action = current ? availableAdminAction(current) : null;
  const dialog = confirmation ?? (recovering && current ? { snapshot: current, action: action ?? (account ? 'BLOCK_ACCOUNT' : 'PAUSE_STORE') } : undefined);
  return <section className={styles.stack}><Link className="stores-link" href={account ? '/admin/contas' : '/admin/lojas'}>{account ? 'Voltar para contas' : 'Voltar para lojas'}</Link>
    {resource.loading && !current && <p role="status">Consultando metadados do alvo…</p>}
    {resource.error ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar metadados novamente</Button></div> : null}
    <p role="status">{notice}</p>{current && <><article className={styles.card}><h2 ref={title} tabIndex={-1}>{'displayName' in current ? current.displayName || 'Conta sem nome de exibição' : current.name || 'Loja sem nome'}</h2>
      <dl className={styles.details}><div><dt>UUID</dt><dd>{current.id}</dd></div><div><dt>Criação</dt><dd><time dateTime={current.createdAt}>{new Date(current.createdAt).toLocaleString('pt-BR')}</time></dd></div><div><dt>Revisão administrativa</dt><dd>{current.version}</dd></div>
        {'suspendedAt' in current ? <><div><dt>Estado de segurança</dt><dd>{current.suspendedAt ? 'Acesso bloqueado por segurança' : 'Acesso ativo'}</dd></div><div><dt>Lojas criadas</dt><dd>{current.createdStores}</dd></div><div><dt>Participações</dt><dd>{current.participations.open} abertas · {current.participations.closed} encerradas · {current.participations.revoked} revogadas</dd></div></> : <>
          <div><dt>Responsável</dt><dd>{current.owner.displayName || 'Conta sem nome'} · {current.owner.id}</dd></div><div><dt>Fuso da loja</dt><dd>{current.timezone}</dd></div>
          <div><dt>Estado do lojista</dt><dd>{ownerState[current.state]}</dd></div><div><dt>Pausa da plataforma</dt><dd>{current.platformPausedAt ? 'Aplicada' : 'Não aplicada'}</dd></div>
          <div><dt>Participantes</dt><dd>{current.participants.open} abertos · {current.participants.closed} encerrados · {current.participants.revoked} revogados</dd></div></>}
      </dl><div className={styles.actions}><Button variant="secondary" onClick={resource.reload}>Atualizar metadados do alvo</Button>
        {action && <Button variant="secondary" onClick={event => { trigger.current = event.currentTarget; setConfirmation({ snapshot: current, action }); }}>{actionLabels[action]}</Button>}</div>
      {'suspendedAt' in current && !current.canBlock && !current.suspendedAt && <p>Esta conta está protegida contra bloqueio pela interface. A gestão de grants e operações excepcionais pertence ao procedimento separado do operador.</p>}
    </article>{account && <AdminRelations profileId={target.id} />}<AdminHistory target={target} /></>}
    {dialog && <AdminActionDialog key={`${target.type}:${target.id}`} target={target} initial={dialog.snapshot} action={dialog.action} returnFocusRef={trigger}
      onConfirmed={confirmed} onClose={() => { setRecovering(null); setConfirmation(undefined); }} />}
  </section>;
}
