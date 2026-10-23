import '../only.ts';
import { Prisma } from '../../generated/prisma/client.ts';
import type { AdminAccountView, AdminCounts, AdminStoreDetail, AdminStoreView, AdminRelationView, AdminActionView } from '../../contracts/admin.ts';
import type { PageResult } from '../../contracts/stores.ts';
import type { StoreTransaction } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import type { AdminPage, ParsedAdminList } from './validation.ts';
import type { AdminHistoryQuery } from '../../contracts/admin.ts';
import { accountSelect, accountView, actionSelect, adminActionView, adminStoreDetail, adminStoreView, noParticipants, storeSelect } from './views.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { visibleAuthoredFields } from '../privacy/views.ts';

async function participationCounts(tx: StoreTransaction, type: 'ACCOUNT' | 'STORE', ids: string[]): Promise<Map<string, AdminCounts>> {
  if (!ids.length) return new Map();
  const column = type === 'ACCOUNT' ? Prisma.sql`"profileId"` : Prisma.sql`"storeId"`;
  const rows = await tx.$queryRaw<(AdminCounts & { id: string })[]>(Prisma.sql`
    SELECT ${column} AS id,
      count(*) FILTER (WHERE "accessRevokedAt" IS NULL AND "closedAt" IS NULL)::int AS open,
      count(*) FILTER (WHERE "accessRevokedAt" IS NULL AND "closedAt" IS NOT NULL)::int AS closed,
      count(*) FILTER (WHERE "accessRevokedAt" IS NOT NULL)::int AS revoked
    FROM app."Membership" WHERE role='PARTICIPANT' AND ${column} IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))})
    GROUP BY ${column}`);
  return new Map(rows.map(row => [row.id, { open: row.open, closed: row.closed, revoked: row.revoked }]));
}

function accountWhere(query: ParsedAdminList): Prisma.ProfileWhereInput {
  return { ...(query.id ? { id: query.id } : {}), ...(query.q ? { displayName: { contains: query.q, mode: 'insensitive' },
    dataSuppressions: { none: { scope: 'IDENTITY' } } } : {}),
    ...(query.security ? { suspendedAt: query.security === 'ACTIVE' ? null : { not: null } } : {}) };
}
function storeWhere(query: ParsedAdminList): Prisma.StoreWhereInput {
  return { ...(query.id ? { id: query.id } : {}), ...(query.state ? { state: query.state } : {}),
    ...(query.platformPaused === undefined ? {} : { platformPausedAt: query.platformPaused ? { not: null } : null }),
    ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' }, createdBy: { dataSuppressions: { none: { scope: 'AUTHORED_CONTENT' } } } },
      { createdBy: { displayName: { contains: query.q, mode: 'insensitive' }, dataSuppressions: { none: { scope: 'IDENTITY' } } } }] } : {}) };
}

export async function adminAccountPage(tx: StoreTransaction, actorId: string, query: ParsedAdminList): Promise<PageResult<AdminAccountView>> {
  const where = accountWhere(query); const total = await tx.profile.count({ where });
  const rows = await tx.profile.findMany({ where, select: accountSelect, skip: query.skip, take: query.pageSize,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const counts = await participationCounts(tx, 'ACCOUNT', rows.map(row => row.id));
  const suppressions = await suppressionFor(tx, rows.map(row => row.id));
  return { items: rows.map(row => accountView(row, counts.get(row.id) ?? noParticipants(), actorId, suppressions)),
    total, page: query.page, pageSize: query.pageSize };
}

export async function adminAccount(tx: StoreTransaction, actorId: string, id: string): Promise<AdminAccountView> {
  const row = await tx.profile.findUnique({ where: { id }, select: accountSelect });
  if (!row) unavailable();
  const counts = await participationCounts(tx, 'ACCOUNT', [id]);
  return accountView(row, counts.get(id) ?? noParticipants(), actorId, await suppressionFor(tx, [row.id]));
}

export async function adminStorePage(tx: StoreTransaction, query: ParsedAdminList): Promise<PageResult<AdminStoreView>> {
  const where = storeWhere(query); const total = await tx.store.count({ where });
  const rows = await tx.store.findMany({ where, select: storeSelect, skip: query.skip, take: query.pageSize,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const counts = await participationCounts(tx, 'STORE', rows.map(row => row.id));
  const suppressions = await suppressionFor(tx, rows.map(row => row.createdBy.id));
  return { items: rows.map(row => adminStoreView(row, counts.get(row.id) ?? noParticipants(), suppressions)),
    total, page: query.page, pageSize: query.pageSize };
}

export async function adminStore(tx: StoreTransaction, id: string): Promise<AdminStoreDetail> {
  const row = await tx.store.findUnique({ where: { id }, select: { ...storeSelect, timezone: true } });
  if (!row) unavailable();
  const counts = await participationCounts(tx, 'STORE', [id]);
  return adminStoreDetail(row, counts.get(id) ?? noParticipants(), await suppressionFor(tx, [row.createdBy.id]));
}

export async function adminRelationPage(tx: StoreTransaction, profileId: string, query: AdminPage): Promise<PageResult<AdminRelationView>> {
  if (!await tx.profile.findUnique({ where: { id: profileId }, select: { id: true } })) unavailable();
  const where = { profileId }; const total = await tx.membership.count({ where });
  const rows = await tx.membership.findMany({ where, select: { id: true, storeId: true, role: true,
    closedAt: true, accessRevokedAt: true, store: { select: { name: true, createdByProfileId: true } } },
    skip: query.skip, take: query.pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const suppressions = await suppressionFor(tx, rows.map(row => row.store.createdByProfileId));
  return { items: rows.map(row => ({ id: row.id, storeId: row.storeId,
    storeName: visibleAuthoredFields(row.store, ['name'], row.store.createdByProfileId, suppressions).name, role: row.role,
    closedAt: row.closedAt?.toISOString() ?? null, accessRevokedAt: row.accessRevokedAt?.toISOString() ?? null })),
  total, page: query.page, pageSize: query.pageSize };
}

export async function adminHistoryPage(tx: StoreTransaction, query: AdminHistoryQuery & AdminPage): Promise<PageResult<AdminActionView>> {
  const target = query.target;
  const exists = target.type === 'ACCOUNT' ? await tx.profile.findUnique({ where: { id: target.id }, select: { id: true } }) :
    await tx.store.findUnique({ where: { id: target.id }, select: { id: true } });
  if (!exists) unavailable();
  const where: Prisma.AdminActionWhereInput = { ...(target.type === 'ACCOUNT' ? { targetProfileId: target.id } : { targetStoreId: target.id }),
    ...(query.action ? { kind: query.action } : {}) };
  const total = await tx.adminAction.count({ where });
  const rows = await tx.adminAction.findMany({ where, select: actionSelect, skip: query.skip, take: query.pageSize,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const suppressions = await suppressionFor(tx, rows.map(row => row.actor.id));
  return { items: rows.map(row => adminActionView(row, suppressions)), total, page: query.page, pageSize: query.pageSize };
}
