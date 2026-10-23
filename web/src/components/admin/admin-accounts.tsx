'use client';

import Link from 'next/link';
import type { AdminAccountView } from '@/contracts/admin';
import { AdminQueryList } from './admin-queries';
import styles from './admin.module.css';

export function AdminAccounts() {
  return <AdminQueryList<AdminAccountView> kind="accounts">{account => <article key={account.id} className={styles.card}>
    <h3>{account.displayName || 'Conta sem nome de exibição'}</h3><p>UUID: {account.id}</p><p>{account.suspendedAt ? 'Acesso bloqueado por segurança' : 'Acesso ativo'}</p>
    <p>{account.createdStores} lojas criadas · {account.participations.open} participações abertas · {account.participations.closed} encerradas · {account.participations.revoked} revogadas.</p>
    <p>Criada em <time dateTime={account.createdAt}>{new Date(account.createdAt).toLocaleString('pt-BR')}</time>.</p><Link className="stores-link" href={`/admin/contas/${account.id}`}>Abrir metadados da conta</Link>
  </article>}</AdminQueryList>;
}
