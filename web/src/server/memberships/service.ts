import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { PageResult, PersonView } from '../../contracts/stores.ts';
import type { Identity } from '../auth/types.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { syncAlbumRetention } from '../albums/retention.ts';
import { assertLifecycleDependencies } from '../stores/lifecycle.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { databaseNow, requireMembership, requireMerchant, storeAudit, withStoreTransaction } from '../stores/transaction.ts';
import { choice, pagination, resourceId, unavailable } from '../stores/validation.ts';
import { personSelect, personView } from '../stores/views.ts';

export async function listMemberships(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<PageResult<PersonView>> {
  const page = pagination(query);
  const state = choice(query, 'state', ['ACTIVE', 'CLOSED', 'ALL'] as const) ?? 'ACTIVE';
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    const where: Prisma.MembershipWhereInput = {
      storeId: scope.store.id, role: 'PARTICIPANT', accessRevokedAt: null,
      ...(state === 'ACTIVE' ? { closedAt: null } : state === 'CLOSED' ? { closedAt: { not: null } } : {}),
      ...(page.q ? { profile: { displayName: { contains: page.q, mode: 'insensitive' },
        dataSuppressions: { none: { scope: 'IDENTITY' } } } } : {}),
    };
    const total = await scope.tx.membership.count({ where });
    const rows = await scope.tx.membership.findMany({
      where, select: personSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: page.skip, take: page.pageSize,
    });
    const suppressions = await suppressionFor(scope.tx, rows.map(row => row.profileId));
    return { items: rows.map(row => personView(row, suppressions)), page: page.page, pageSize: page.pageSize, total };
  });
}

export async function readMembership(identity: Identity, storeId: string, membershipId: string): Promise<PersonView> {
  const targetId = resourceId(membershipId);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const actor = requireMembership(scope);
    const membership = await scope.tx.membership.findFirst({
      where: {
        id: targetId, storeId: scope.store.id, accessRevokedAt: null,
        ...(actor.role === 'PARTICIPANT' ? { profileId: identity.userId } : {}),
      }, select: personSelect,
    });
    if (!membership) unavailable();
    return personView(membership, await suppressionFor(scope.tx, [membership.profileId]));
  });
}

export async function closeMembership(identity: Identity, storeId: string, membershipId: string): Promise<PersonView> {
  const targetId = resourceId(membershipId);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const actor = requireMembership(scope);
    if (actor.role === 'MERCHANT') requireMerchant(scope);
    await scope.tx.$queryRaw`SELECT id FROM app."Membership" WHERE id = ${targetId}::uuid AND "storeId" = ${scope.store.id}::uuid FOR UPDATE`;
    const target = await scope.tx.membership.findFirst({
      where: { id: targetId, storeId: scope.store.id, role: 'PARTICIPANT', accessRevokedAt: null }, select: personSelect,
    });
    if (!target || (actor.role !== 'MERCHANT' && target.profileId !== identity.userId)) unavailable();
    if (target.closedAt) return personView(target, await suppressionFor(scope.tx, [target.profileId]));
    await assertLifecycleDependencies(scope.tx, { storeId: scope.store.id, membershipId: target.id });
    const result = await scope.tx.membership.update({
      where: { id: target.id }, data: { closedAt: await databaseNow(scope.tx) }, select: personSelect,
    });
    await syncAlbumRetention(scope, { membershipId: target.id });
    await storeAudit(scope, 'membership.closed', target.id);
    return personView(result, await suppressionFor(scope.tx, [result.profileId]));
  });
}
