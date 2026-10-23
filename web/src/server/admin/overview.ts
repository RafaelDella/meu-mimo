import '../only.ts';
import type { AdminOverview } from '../../contracts/admin.ts';
import type { StoreTransaction } from '../stores/transaction.ts';
import { databaseNow } from '../stores/transaction.ts';

export async function adminOverview(tx: StoreTransaction): Promise<AdminOverview> {
  const to = await databaseNow(tx); const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const createdAt = { gte: from, lt: to };
  const active = await tx.profile.count({ where: { suspendedAt: null } });
  const blocked = await tx.profile.count({ where: { suspendedAt: { not: null } } });
  const storeActive = await tx.store.count({ where: { state: 'ACTIVE' } });
  const paused = await tx.store.count({ where: { state: 'PAUSED' } });
  const closed = await tx.store.count({ where: { state: 'CLOSED' } });
  const platformPaused = await tx.store.count({ where: { platformPausedAt: { not: null } } });
  const accountsCreated = await tx.profile.count({ where: { createdAt } });
  const storesCreated = await tx.store.count({ where: { createdAt } });
  const actions = await tx.adminAction.count({ where: { createdAt } });
  return { accounts: { active, blocked }, stores: { active: storeActive, paused, closed, platformPaused },
    recent: { accountsCreated, storesCreated, actions }, window: { from: from.toISOString(), to: to.toISOString(), timezone: 'UTC' } };
}
