import '../only.ts';
import type { AdminAccountView, AdminActionLookup, AdminActionResult, AdminOverview, AdminRelationView, AdminStoreDetail, AdminStoreView, AdminActionView } from '../../contracts/admin.ts';
import type { PageResult } from '../../contracts/stores.ts';
import type { Identity } from '../auth/types.ts';
import type { AdminContext } from '../authorization/types.ts';
import type { StoreTransaction } from '../stores/transaction.ts';
import { allowedFields, resourceId, unavailable } from '../stores/validation.ts';
import { withAdminCommandTransaction, withAdminTransaction } from './access.ts';
import { commandAdminAction } from './commands.ts';
import { consumeAdminLimit } from './limits.ts';
import { adminOverview } from './overview.ts';
import { adminAccount, adminAccountPage, adminHistoryPage, adminRelationPage, adminStore, adminStorePage } from './queries.ts';
import { adminPage, parseAdminAction, parseAdminHistory, parseAdminList } from './validation.ts';
import { actionSelect, adminActionView } from './views.ts';
import type { ActionRow } from './views.ts';

export async function readAdminSession(identity: Identity): Promise<AdminContext> {
  await consumeAdminLimit(identity, 'read');
  return withAdminTransaction(identity, async () => ({ actorUserId: identity.userId, assuranceLevel: 'aal2' as const }));
}
export async function readAdminOverview(identity: Identity): Promise<AdminOverview> {
  await consumeAdminLimit(identity, 'read');
  return withAdminTransaction(identity, adminOverview);
}
export async function searchAdminAccounts(identity: Identity, body: Record<string, unknown>): Promise<PageResult<AdminAccountView>> {
  await consumeAdminLimit(identity, 'read'); const query = parseAdminList(body, 'ACCOUNT');
  return withAdminTransaction(identity, tx => adminAccountPage(tx, identity.userId, query));
}
export async function readAdminAccount(identity: Identity, profileId: string): Promise<AdminAccountView> {
  await consumeAdminLimit(identity, 'read'); const id = resourceId(profileId);
  return withAdminTransaction(identity, tx => adminAccount(tx, identity.userId, id));
}
export async function readAdminRelations(identity: Identity, profileId: string, body: Record<string, unknown>): Promise<PageResult<AdminRelationView>> {
  await consumeAdminLimit(identity, 'read'); const id = resourceId(profileId);
  allowedFields(body, ['page', 'pageSize']); const query = adminPage(body);
  return withAdminTransaction(identity, tx => adminRelationPage(tx, id, query));
}
export async function searchAdminStores(identity: Identity, body: Record<string, unknown>): Promise<PageResult<AdminStoreView>> {
  await consumeAdminLimit(identity, 'read'); const query = parseAdminList(body, 'STORE');
  return withAdminTransaction(identity, tx => adminStorePage(tx, query));
}
export async function readAdminStore(identity: Identity, storeId: string): Promise<AdminStoreDetail> {
  await consumeAdminLimit(identity, 'read'); const id = resourceId(storeId);
  return withAdminTransaction(identity, tx => adminStore(tx, id));
}
export async function readAdminHistory(identity: Identity, body: Record<string, unknown>): Promise<PageResult<AdminActionView>> {
  await consumeAdminLimit(identity, 'read'); const query = parseAdminHistory(body);
  return withAdminTransaction(identity, tx => adminHistoryPage(tx, query));
}

async function actionResult(tx: StoreTransaction, actorId: string, row: ActionRow): Promise<AdminActionResult> {
  const operation = adminActionView(row);
  const current = operation.target.type === 'ACCOUNT' ? await adminAccount(tx, actorId, operation.target.id) :
    await adminStore(tx, operation.target.id);
  return { operation, current, appliedVersion: operation.version };
}

export async function applyAdminAction(identity: Identity, body: Record<string, unknown>): Promise<AdminActionResult> {
  await consumeAdminLimit(identity, 'write'); const input = parseAdminAction(body);
  return withAdminCommandTransaction(identity, async tx => {
    const id = await commandAdminAction(tx, identity, input);
    const row = await tx.adminAction.findFirst({ where: { id, actorProfileId: identity.userId }, select: actionSelect });
    if (!row) unavailable();
    return actionResult(tx, identity.userId, row);
  });
}

export async function lookupAdminAction(identity: Identity, operationId: string): Promise<AdminActionLookup> {
  await consumeAdminLimit(identity, 'read'); const id = resourceId(operationId);
  return withAdminTransaction(identity, async tx => {
    const row = await tx.adminAction.findFirst({ where: { id, actorProfileId: identity.userId }, select: actionSelect });
    return { operation: row ? await actionResult(tx, identity.userId, row) : null };
  });
}
