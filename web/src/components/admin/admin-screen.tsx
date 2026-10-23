'use client';

import type { AdminTargetRef } from '@/contracts/admin';
import { AdminArea } from './admin-area';
import { AdminNavigation } from './admin-navigation';
import { AdminOverview } from './admin-overview';
import { AdminAccounts } from './admin-accounts';
import { AdminStores } from './admin-stores';
import { AdminDetail } from './admin-detail';
import styles from './admin.module.css';

export function AdminScreen({ section, target }: { section: 'overview' | 'accounts' | 'stores'; target?: AdminTargetRef }) {
  return <AdminArea>{identityKey => <div key={`${identityKey}:${section}:${target?.id ?? ''}`} className={styles.stack}><AdminNavigation section={section} />
    {target ? <AdminDetail target={target} /> : section === 'accounts' ? <AdminAccounts /> : section === 'stores' ? <AdminStores /> : <AdminOverview />}
  </div>}</AdminArea>;
}
