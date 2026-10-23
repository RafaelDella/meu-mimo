'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminActionKind, AdminActionView, AdminHistoryQuery, AdminPage, AdminTargetRef } from '@/contracts/admin';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/stores/store-controls';
import { storeError } from '@/components/stores/store-api';
import { useAdminResource } from './transport';
import { actionLabels } from './admin-action-dialog';
import styles from './admin.module.css';

export function AdminHistory({ target }: { target: AdminTargetRef }) {
  const [page, setPage] = useState(1); const [action, setAction] = useState(''); const title = useRef<HTMLHeadingElement>(null); const focus = useRef(false);
  const query: AdminHistoryQuery = { target, page, pageSize: 20, ...(action ? { action: action as AdminActionKind } : {}) };
  const resource = useAdminResource<AdminPage<AdminActionView>>('/api/admin/historico/consulta', query);
  useEffect(() => { if (!resource.loading && focus.current) { focus.current = false; title.current?.focus(); } }, [resource.loading]);
  return <section className={styles.card}><h2 ref={title} tabIndex={-1}>Histórico administrativo</h2>
    <label className={styles.field}>Ação no histórico<select className="ui-input" value={action} onChange={event => { setAction(event.target.value); setPage(1); }}><option value="">Todas as ações do alvo</option>
      {Object.entries(actionLabels).filter(([kind]) => target.type === 'ACCOUNT' ? kind.endsWith('ACCOUNT') : kind.endsWith('STORE')).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
    {resource.loading && <p role="status">Consultando auditoria administrativa…</p>}{resource.error ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar auditoria novamente</Button></div> : null}
    {resource.data && <>{!resource.data.items.length && <p>Nenhuma ação administrativa registrada para este alvo.</p>}<ol className={styles.list}>{resource.data.items.map(event => <li className={styles.card} key={event.id}>
      <h3>{actionLabels[event.action]}</h3><p>Por {event.actor.displayName || 'Operador autorizado'} · {event.actor.id}</p><p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('pt-BR')}</time> · Revisão {event.version}</p>
      <p className={styles.text}>{event.reason}</p><p>Restrição anterior: {event.previousRestrictedAt ? 'Aplicada' : 'Ausente'}. Restrição após a ação: {event.restrictedAt ? 'Aplicada' : 'Ausente'}.</p>
    </li>)}</ol><Pagination {...resource.data} onPage={next => { focus.current = true; setPage(next); }} /></>}
  </section>;
}
