'use client';

import Link from 'next/link';
import type { AdminStoreView } from '@/contracts/admin';
import { AdminQueryList } from './admin-queries';
import styles from './admin.module.css';

export const ownerState = { ACTIVE: 'Ativo', PAUSED: 'Pausado', CLOSED: 'Encerrado' };
export function AdminStores() {
  return <AdminQueryList<AdminStoreView> kind="stores">{store => <article key={store.id} className={styles.card}>
    <h3>{store.name || 'Loja sem nome'}</h3><p>UUID: {store.id}</p><p>Responsável: {store.owner.displayName || 'Conta sem nome'} · {store.owner.id}</p>
    <p>Estado do lojista: {ownerState[store.state]}. Pausa da plataforma: {store.platformPausedAt ? 'Aplicada' : 'Não aplicada'}.</p>
    <p>{store.participants.open} participantes abertos · {store.participants.closed} encerrados · {store.participants.revoked} revogados.</p>
    <Link className="stores-link" href={`/admin/lojas/${store.id}`}>Abrir metadados da loja</Link>
  </article>}</AdminQueryList>;
}
