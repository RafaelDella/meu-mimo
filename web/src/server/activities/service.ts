import '../only.ts';
import type { Activity, ActivityEvent, Prisma } from '../../generated/prisma/client.ts';
import type { ActivityMutation, ActivityPage, ActivityView } from '../../contracts/activities.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { assertStoreWritable, databaseNow, requireMembership, requireMerchant, withStoreTransaction } from '../stores/transaction.ts';
import { allowedFields, choice, operationConflict, operationId, pagination } from '../stores/validation.ts';
import { requireActivity } from './access.ts';
import { activityFields, configuration, digest, positiveInteger } from './validation.ts';
import { activityConfiguration, activityView, assertActivityOpen } from './views.ts';

async function existingMutation(scope: StoreScope, id: string, kind: string, requestDigest: string,
  activityId: string): Promise<ActivityEvent | null> {
  const key = `meumimo:t07:activity-operation:${id}`;
  await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const event = await scope.tx.activityEvent.findUnique({ where: { id } });
  if (event && (event.storeId !== scope.store.id || event.activityId !== activityId ||
      event.actorProfileId !== scope.identity.userId || event.kind !== kind || event.requestDigest !== requestDigest)) operationConflict();
  return event;
}

async function recordMutation(scope: StoreScope, activity: Activity, id: string, kind: string, requestDigest: string, now: Date): Promise<void> {
  await scope.tx.activityEvent.create({ data: { id, storeId: scope.store.id, activityId: activity.id,
    actorProfileId: scope.identity.userId, version: activity.version, kind, requestDigest, createdAt: now,
    configuration: { ...activityConfiguration(activity), archivedAt: activity.archivedAt?.toISOString() ?? null } } });
}

function assertVersion(activity: Activity, version: number): void {
  if (activity.version !== version) throw new AppError('activity_changed', 409, 'A regra desta atividade mudou. Atualize e revise os dados antes de salvar.');
  if (activity.version >= 2_147_483_647) throw new AppError('activity_read_only', 409, 'Esta atividade está disponível somente para consulta.');
}

export async function listActivities(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<ActivityPage> {
  const page = pagination(query);
  const state = choice(query, 'state', ['ACTIVE', 'ARCHIVED', 'ALL'] as const) ?? 'ACTIVE';
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMembership(scope);
    const where: Prisma.ActivityWhereInput = { storeId: scope.store.id,
      ...(state === 'ACTIVE' ? { archivedAt: null } : state === 'ARCHIVED' ? { archivedAt: { not: null } } : {}),
      ...(page.q ? { name: { contains: page.q, mode: 'insensitive' }, creator: { dataSuppressions: { none: { scope: 'AUTHORED_CONTENT' } } } } : {}) };
    const total = await scope.tx.activity.count({ where });
    const rows = await scope.tx.activity.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.pageSize });
    const now = await databaseNow(scope.tx);
    const items: ActivityView[] = [];
    const suppressions = await suppressionFor(scope.tx, rows.map(row => row.createdByProfileId));
    for (const row of rows) items.push(await activityView(scope, row, now, suppressions));
    return { items, total, page: page.page, pageSize: page.pageSize };
  });
}

export async function readActivity(identity: Identity, storeId: string, activityId: string): Promise<ActivityView> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => activityView(scope, await requireActivity(scope, activityId), await databaseNow(scope.tx)));
}

export async function createActivity(identity: Identity, storeId: string, body: Record<string, unknown>): Promise<ActivityMutation> {
  allowedFields(body, ['operationId', ...activityFields]);
  const id = operationId(body);
  const fields = configuration(body);
  const requestDigest = digest(fields);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    const existing = await existingMutation(scope, id, 'CREATE', requestDigest, id);
    const now = await databaseNow(scope.tx);
    if (existing) return { activity: await activityView(scope, await requireActivity(scope, id), now), appliedVersion: existing.version };
    assertStoreWritable(scope, true);
    if (await scope.tx.activity.findUnique({ where: { id } })) operationConflict();
    const activity = await scope.tx.activity.create({ data: { id, storeId: scope.store.id,
      createdByProfileId: identity.userId, ...fields, createdAt: now } });
    await recordMutation(scope, activity, id, 'CREATE', requestDigest, now);
    return { activity: await activityView(scope, activity, now), appliedVersion: activity.version };
  });
}

export async function updateActivity(identity: Identity, storeId: string, activityId: string, body: Record<string, unknown>): Promise<ActivityMutation> {
  allowedFields(body, ['operationId', 'expectedVersion', ...activityFields]);
  const id = operationId(body);
  const expectedVersion = positiveInteger(body.expectedVersion);
  const fields = configuration(body);
  const requestDigest = digest({ expectedVersion, ...fields });
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    const current = await requireActivity(scope, activityId);
    const existing = await existingMutation(scope, id, 'UPDATE', requestDigest, current.id);
    const now = await databaseNow(scope.tx);
    if (existing) return { activity: await activityView(scope, current, now), appliedVersion: existing.version };
    assertStoreWritable(scope, true);
    assertActivityOpen(current);
    assertVersion(current, expectedVersion);
    const activity = await scope.tx.activity.update({ where: { id: current.id }, data: { ...fields, version: { increment: 1 } } });
    await recordMutation(scope, activity, id, 'UPDATE', requestDigest, now);
    return { activity: await activityView(scope, activity, now), appliedVersion: activity.version };
  });
}

export async function archiveActivity(identity: Identity, storeId: string, activityId: string, body: Record<string, unknown>): Promise<ActivityMutation> {
  allowedFields(body, ['operationId', 'expectedVersion']);
  const id = operationId(body);
  const expectedVersion = positiveInteger(body.expectedVersion);
  const requestDigest = digest({ expectedVersion });
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    const current = await requireActivity(scope, activityId);
    const existing = await existingMutation(scope, id, 'ARCHIVE', requestDigest, current.id);
    const now = await databaseNow(scope.tx);
    if (existing) return { activity: await activityView(scope, current, now), appliedVersion: existing.version };
    assertStoreWritable(scope, true);
    assertActivityOpen(current);
    assertVersion(current, expectedVersion);
    const activity = await scope.tx.activity.update({ where: { id: current.id }, data: { archivedAt: now, version: { increment: 1 } } });
    await recordMutation(scope, activity, id, 'ARCHIVE', requestDigest, now);
    return { activity: await activityView(scope, activity, now), appliedVersion: activity.version };
  });
}
