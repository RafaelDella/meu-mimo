import '../only.ts';
import type { Prisma, Reward, RewardEvent } from '../../generated/prisma/client.ts';
import type { RewardMutation, RewardPage, RewardView } from '../../contracts/rewards.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { assertStoreWritable, databaseNow, requireMembership, withStoreTransaction } from '../stores/transaction.ts';
import { allowedFields, choice, invalidField, operationConflict, operationId, pagination } from '../stores/validation.ts';
import { requireCatalogMerchant, requireReward } from './access.ts';
import { configuration, digest, positiveInteger, rewardFields } from './validation.ts';
import { rewardBalance, rewardConfiguration, rewardView } from './views.ts';

async function existingMutation(scope: StoreScope, id: string, kind: string, requestDigest: string,
  rewardId: string): Promise<RewardEvent | null> {
  const key = `meumimo:t09:reward-operation:${id}`;
  await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const event = await scope.tx.rewardEvent.findUnique({ where: { id } });
  if (event && (event.storeId !== scope.store.id || event.rewardId !== rewardId ||
      event.actorProfileId !== scope.identity.userId || event.kind !== kind || event.requestDigest !== requestDigest)) operationConflict();
  return event;
}

async function recordMutation(scope: StoreScope, reward: Reward, id: string, kind: string, requestDigest: string, now: Date): Promise<void> {
  await scope.tx.rewardEvent.create({ data: { id, storeId: scope.store.id, rewardId: reward.id,
    actorProfileId: scope.identity.userId, version: reward.version, kind, requestDigest, createdAt: now,
    configuration: { ...rewardConfiguration(reward), stockRevision: reward.stockRevision,
      archivedAt: reward.archivedAt?.toISOString() ?? null } } });
}

function assertVersions(reward: Reward, version: number, stockRevision: number): void {
  if (reward.version !== version) throw new AppError('reward_changed', 409, 'Este mimo mudou. Atualize e revise os dados antes de salvar.');
  if (reward.stockRevision !== stockRevision) throw new AppError('stock_changed', 409, 'A quantidade disponível mudou. Atualize e revise antes de salvar.');
  if (reward.version >= 2_147_483_647 || reward.stockRevision >= 2_147_483_647) {
    throw new AppError('reward_read_only', 409, 'Este mimo está disponível somente para consulta.');
  }
  if (reward.archivedAt) throw new AppError('reward_unavailable', 409, 'Este mimo foi arquivado. Os tickets anteriores continuam disponíveis.');
}

export async function listRewards(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<RewardPage> {
  const page = pagination(query);
  const state = choice(query, 'state', ['ACTIVE', 'ARCHIVED', 'ALL'] as const) ?? 'ACTIVE';
  const category = query.get('category');
  if (category !== null && ([...category].length > 80 || /[\u0000-\u001f\u007f]/.test(category) || /[\uD800-\uDFFF]/u.test(category))) invalidField();
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const actor = requireMembership(scope);
    if (actor.role !== 'MERCHANT' && state !== 'ACTIVE') invalidField();
    const base: Prisma.RewardWhereInput = { storeId: scope.store.id,
      ...(state === 'ACTIVE' ? { archivedAt: null } : state === 'ARCHIVED' ? { archivedAt: { not: null } } : {}) };
    const where: Prisma.RewardWhereInput = { ...base, ...(category !== null ? { category } : {}),
      ...(page.q ? { name: { contains: page.q, mode: 'insensitive' } } : {}) };
    const total = await scope.tx.reward.count({ where });
    const rows = await scope.tx.reward.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.pageSize });
    const categories = await scope.tx.reward.findMany({ where: base, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } });
    const balance = await rewardBalance(scope);
    const items: RewardView[] = [];
    for (const row of rows) items.push(await rewardView(scope, row, balance));
    return { items, total, page: page.page, pageSize: page.pageSize, categories: categories.map(row => row.category).filter(Boolean) };
  });
}

export async function readReward(identity: Identity, storeId: string, rewardId: string): Promise<RewardView> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => rewardView(scope, await requireReward(scope, rewardId)));
}

export async function createReward(identity: Identity, storeId: string, body: Record<string, unknown>): Promise<RewardMutation> {
  allowedFields(body, ['operationId', ...rewardFields]);
  const id = operationId(body);
  const fields = configuration(body);
  const requestDigest = digest(fields);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireCatalogMerchant(scope);
    const existing = await existingMutation(scope, id, 'CREATE', requestDigest, id);
    if (existing) return { reward: await rewardView(scope, await requireReward(scope, id)), appliedVersion: existing.version };
    assertStoreWritable(scope, true);
    if (await scope.tx.reward.findUnique({ where: { id } })) operationConflict();
    const now = await databaseNow(scope.tx);
    const reward = await scope.tx.reward.create({ data: { id, storeId: scope.store.id,
      createdByProfileId: identity.userId, ...fields, createdAt: now } });
    await recordMutation(scope, reward, id, 'CREATE', requestDigest, now);
    return { reward: await rewardView(scope, reward), appliedVersion: reward.version };
  });
}

export async function updateReward(identity: Identity, storeId: string, rewardId: string, body: Record<string, unknown>): Promise<RewardMutation> {
  allowedFields(body, ['operationId', 'expectedVersion', 'expectedStockRevision', ...rewardFields]);
  const id = operationId(body);
  const expectedVersion = positiveInteger(body.expectedVersion);
  const expectedStockRevision = positiveInteger(body.expectedStockRevision);
  const fields = configuration(body);
  const requestDigest = digest({ expectedVersion, expectedStockRevision, ...fields });
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireCatalogMerchant(scope);
    const current = await requireReward(scope, rewardId);
    const existing = await existingMutation(scope, id, 'UPDATE', requestDigest, current.id);
    if (existing) return { reward: await rewardView(scope, current), appliedVersion: existing.version };
    assertStoreWritable(scope, true);
    assertVersions(current, expectedVersion, expectedStockRevision);
    const reward = await scope.tx.reward.update({ where: { id: current.id }, data: { ...fields,
      version: { increment: 1 }, ...(current.stock !== fields.stock ? { stockRevision: { increment: 1 } } : {}) } });
    await recordMutation(scope, reward, id, 'UPDATE', requestDigest, await databaseNow(scope.tx));
    return { reward: await rewardView(scope, reward), appliedVersion: reward.version };
  });
}

export async function archiveReward(identity: Identity, storeId: string, rewardId: string, body: Record<string, unknown>): Promise<RewardMutation> {
  allowedFields(body, ['operationId', 'expectedVersion', 'expectedStockRevision']);
  const id = operationId(body);
  const expectedVersion = positiveInteger(body.expectedVersion);
  const expectedStockRevision = positiveInteger(body.expectedStockRevision);
  const requestDigest = digest({ expectedVersion, expectedStockRevision });
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireCatalogMerchant(scope);
    const current = await requireReward(scope, rewardId);
    const existing = await existingMutation(scope, id, 'ARCHIVE', requestDigest, current.id);
    if (existing) return { reward: await rewardView(scope, current), appliedVersion: existing.version };
    assertStoreWritable(scope, true);
    assertVersions(current, expectedVersion, expectedStockRevision);
    const now = await databaseNow(scope.tx);
    const reward = await scope.tx.reward.update({ where: { id: current.id }, data: { archivedAt: now, version: { increment: 1 } } });
    await recordMutation(scope, reward, id, 'ARCHIVE', requestDigest, now);
    return { reward: await rewardView(scope, reward), appliedVersion: reward.version };
  });
}
