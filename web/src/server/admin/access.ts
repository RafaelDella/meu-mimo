import '../only.ts';
import type { Identity } from '../auth/types.ts';
import { requireAdminAccess } from '../authorization/admin.ts';
import { getDb } from '../db/client.ts';
import type { StoreTransaction } from '../stores/transaction.ts';
import { assertIdentityInTransaction } from '../stores/transaction.ts';
import { adminDatabaseError, adminSqlCode } from './errors.ts';

async function authorizedTransaction<T>(identity: Identity, operation: (tx: StoreTransaction) => Promise<T>,
  isolationLevel: 'RepeatableRead' | 'ReadCommitted'): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    await requireAdminAccess(identity);
    try {
      return await getDb().$transaction(async tx => {
        await assertIdentityInTransaction(tx, identity);
        await tx.$queryRaw`SELECT 1 AS authorized FROM app.lock_admin_access(${identity.userId}::uuid,${identity.sessionId}::uuid)`;
        return operation(tx);
      }, { isolationLevel, maxWait: 5_000, timeout: 10_000 });
    } catch (error) {
      if (attempt < 2 && ['40001', '40P01', 'P2034'].includes(adminSqlCode(error) ?? '')) continue;
      throw adminDatabaseError(error);
    }
  }
}

export function withAdminTransaction<T>(identity: Identity, operation: (tx: StoreTransaction) => Promise<T>): Promise<T> {
  return authorizedTransaction(identity, operation, 'RepeatableRead');
}

export function withAdminCommandTransaction<T>(identity: Identity, operation: (tx: StoreTransaction) => Promise<T>): Promise<T> {
  return authorizedTransaction(identity, operation, 'ReadCommitted');
}
