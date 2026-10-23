import '../only.ts';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { PageResult, StoreView } from '../../contracts/stores.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { syncAlbumRetention } from '../albums/retention.ts';
import { assertLifecycleDependencies } from './lifecycle.ts';
import { consumeStoreLimit } from './limits.ts';
import {
  assertStoreWritable, databaseNow, requireMembership, requireMerchant, storeAudit,
  withIdentityTransaction, withStoreTransaction,
} from './transaction.ts';
import {
  allowedFields, choice, invalidField, operationConflict, operationId, pagination,
  textField, timezoneField, unavailable,
} from './validation.ts';
import { storeView } from './views.ts';

export async function listStores(identity: Identity, query = new URLSearchParams()): Promise<PageResult<StoreView>> {
  const page = pagination(query);
  const role = choice(query, 'role', ['MERCHANT', 'PARTICIPANT'] as const);
  const state = choice(query, 'state', ['ACTIVE', 'PAUSED', 'CLOSED', 'ALL'] as const);
  await consumeStoreLimit(identity, 'read');
  return withIdentityTransaction(identity, async tx => {
    const where: Prisma.MembershipWhereInput = {
      profileId: identity.userId, accessRevokedAt: null, ...(role ? { role } : {}),
      ...(page.q ? { store: { name: { contains: page.q, mode: 'insensitive' },
        createdBy: { dataSuppressions: { none: { scope: 'AUTHORED_CONTENT' } } } } } : {}),
    };
    if (state === 'CLOSED') where.OR = [{ closedAt: { not: null } }, { store: { state: 'CLOSED' } }];
    else if (state !== 'ALL') {
      where.closedAt = null;
      where.AND = [{ store: { state: state ?? { in: ['ACTIVE', 'PAUSED'] } } }];
    }
    const total = await tx.membership.count({ where });
    const rows = await tx.membership.findMany({
      where, include: { store: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page.skip, take: page.pageSize,
    });
    const suppressions = await suppressionFor(tx, rows.map(row => row.store.createdByProfileId));
    return { items: rows.map(row => storeView(row.store, row, suppressions)), page: page.page, pageSize: page.pageSize, total };
  });
}

export async function createStore(identity: Identity, body: Record<string, unknown>): Promise<StoreView> {
  allowedFields(body, ['operationId', 'name', 'presentation', 'timezone']);
  const operation = operationId(body);
  const name = textField(body, 'name', 80);
  const presentation = textField(body, 'presentation', 280, true);
  const timezone = body.timezone === undefined ? 'America/Sao_Paulo' : timezoneField(body);
  const creationDigest = createHash('sha256').update(JSON.stringify({ name, presentation, timezone })).digest('hex');
  await consumeStoreLimit(identity, 'write');
  return withIdentityTransaction(identity, async tx => {
    const key = `meumimo:t04:store-operation:${operation}`;
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const existing = await tx.store.findUnique({ where: { operationId: operation } });
    if (existing) {
      if (existing.createdByProfileId !== identity.userId || existing.creationDigest !== creationDigest) operationConflict();
      await tx.$queryRaw`SELECT id FROM app."Store" WHERE id = ${existing.id}::uuid FOR UPDATE`;
      const current = await tx.store.findUnique({ where: { id: existing.id } });
      const membership = await tx.membership.findUnique({
        where: { storeId_profileId: { storeId: existing.id, profileId: identity.userId } },
      });
      if (!current || !membership || membership.role !== 'MERCHANT' || membership.accessRevokedAt) unavailable();
      return storeView(current, membership, await suppressionFor(tx, [current.createdByProfileId]));
    }
    const store = await tx.store.create({ data: {
      operationId: operation, creationDigest, name, presentation, timezone, createdByProfileId: identity.userId,
    } });
    const membership = await tx.membership.create({ data: { storeId: store.id, profileId: identity.userId, role: 'MERCHANT' } });
    await storeAudit({ tx, identity, store }, 'store.created', store.id);
    return storeView(store, membership, await suppressionFor(tx, [store.createdByProfileId]));
  });
}

export async function readStore(identity: Identity, storeId: string): Promise<StoreView> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => storeView(scope.store, requireMembership(scope),
    await suppressionFor(scope.tx, [scope.store.createdByProfileId])));
}

export async function updateStore(identity: Identity, storeId: string, body: Record<string, unknown>): Promise<StoreView> {
  allowedFields(body, ['name', 'presentation', 'timezone']);
  if (!Object.keys(body).length) invalidField();
  const changes = {
    ...(body.name !== undefined ? { name: textField(body, 'name', 80) } : {}),
    ...(body.presentation !== undefined ? { presentation: textField(body, 'presentation', 280, true) } : {}),
    ...(body.timezone !== undefined ? { timezone: timezoneField(body) } : {}),
  };
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const membership = requireMerchant(scope);
    assertStoreWritable(scope, true);
    if (changes.timezone && changes.timezone !== scope.store.timezone && scope.store.domainStartedAt) {
      throw new AppError('timezone_locked', 409, 'O fuso não pode mudar depois do primeiro registro ou ticket.');
    }
    const store = await scope.tx.store.update({ where: { id: scope.store.id }, data: changes });
    await storeAudit(scope, 'store.updated', store.id);
    return storeView(store, membership, await suppressionFor(scope.tx, [store.createdByProfileId]));
  });
}

export async function changeStoreState(identity: Identity, storeId: string, body: Record<string, unknown>): Promise<StoreView> {
  allowedFields(body, ['action']);
  const action = body.action;
  if (action !== 'pause' && action !== 'resume' && action !== 'close') invalidField();
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const membership = requireMerchant(scope);
    const target = action === 'pause' ? 'PAUSED' : action === 'resume' ? 'ACTIVE' : 'CLOSED';
    if (scope.store.state === target) return storeView(scope.store, membership, await suppressionFor(scope.tx, [scope.store.createdByProfileId]));
    assertStoreWritable(scope, true);
    if (action === 'close') await assertLifecycleDependencies(scope.tx, { storeId: scope.store.id });
    const now = await databaseNow(scope.tx);
    const store = await scope.tx.store.update({ where: { id: scope.store.id }, data: {
      state: target, pausedAt: target === 'PAUSED' ? now : null, closedAt: target === 'CLOSED' ? now : null,
    } });
    if (action === 'close') await syncAlbumRetention({ ...scope, store });
    await storeAudit(scope, action === 'pause' ? 'store.paused' : action === 'resume' ? 'store.resumed' : 'store.closed', store.id);
    return storeView(store, membership, await suppressionFor(scope.tx, [store.createdByProfileId]));
  });
}
