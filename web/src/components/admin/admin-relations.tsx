'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AdminPage, AdminRelationView } from '@/contracts/admin';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/stores/store-controls';
import { storeError } from '@/components/stores/store-api';
import { useAdminResource } from './transport';
import styles from './admin.module.css';

export function AdminRelations({ profileId }: { profileId: string }) {
  const [page, setPage] = useState(1); const title = useRef<HTMLHeadingElement>(null); const focus = useRef(false);
  const resource = useAdminResource<AdminPage<AdminRelationView>>(`/api/admin/contas/${profileId}/vinculos/consulta`, { page, pageSize: 20 });
  useEffect(() => { if (!resource.loading && focus.current) { focus.current = false; title.current?.focus(); } }, [resource.loading]);
  return <section className={styles.card}><h2 ref={title} tabIndex={-1}>Vínculos administrativos</h2><p>Somente loja, papel e estado do vínculo. Nenhum conteúdo da relação é aberto por aqui.</p>
    {resource.loading && <p role="status">Consultando vínculos…</p>}{resource.error ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar vínculos novamente</Button></div> : null}
    {resource.data && <>{!resource.data.items.length && <p>Nenhum vínculo encontrado.</p>}<ul className={styles.list}>{resource.data.items.map(relation => <li key={relation.id}>
      <h3>{relation.storeName || 'Loja sem nome'}</h3><p>{relation.role === 'MERCHANT' ? 'Responsável' : 'Participante'} · {relation.accessRevokedAt ? 'Acesso revogado' : relation.closedAt ? 'Encerrado' : 'Aberto'}</p><p>UUID do vínculo: {relation.id}</p>
      <Link className="stores-link" href={`/admin/lojas/${relation.storeId}`}>Abrir metadados da loja</Link>
    </li>)}</ul><Pagination {...resource.data} onPage={next => { focus.current = true; setPage(next); }} /></>}
  </section>;
}
