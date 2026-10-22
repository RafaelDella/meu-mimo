import '../only.ts';
import type { Identity } from '../auth/types.ts';
import { getDb } from '../db/client.ts';
import { AppError } from '../errors.ts';
import { requireStoreAccess } from './store.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const membershipSelect = {
  id: true, storeId: true, profileId: true, role: true,
  profile: { select: { displayName: true } },
} as const;

function requireResourceId(value: string) {
  if (!uuid.test(value)) throw new AppError('resource_not_found', 404, 'Este conteúdo não está disponível.');
}

export async function readStore(identity: Identity, storeId: string) {
  requireResourceId(storeId);
  const context = await requireStoreAccess(identity, storeId, 'store:read');
  const store = await getDb().store.findUnique({ where: { id: context.storeId }, select: { id: true, name: true } });
  if (!store) throw new AppError('resource_not_found', 404, 'Este conteúdo não está disponível.');
  return { ...store, role: context.role };
}

export async function listMemberships(identity: Identity, storeId: string) {
  requireResourceId(storeId);
  const context = await requireStoreAccess(identity, storeId, 'membership:list');
  // Lista de gestão inicial, restrita ao lojista; paginação do produto entra em T04.
  const memberships = await getDb().membership.findMany({
    where: { storeId: context.storeId, accessRevokedAt: null },
    select: membershipSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 50,
  });
  return { memberships };
}

export async function readMembership(identity: Identity, storeId: string, membershipId: string) {
  requireResourceId(storeId);
  requireResourceId(membershipId);
  const context = await requireStoreAccess(identity, storeId, 'membership:read', membershipId);
  if (context.targetMembershipId !== membershipId) {
    throw new AppError('resource_not_found', 404, 'Este conteúdo não está disponível.');
  }
  const membership = await getDb().membership.findFirst({
    where: {
      id: context.targetMembershipId, storeId: context.storeId, accessRevokedAt: null,
      ...(context.role === 'PARTICIPANT' ? { profileId: context.actorUserId } : {}),
    },
    select: membershipSelect,
  });
  if (!membership) throw new AppError('resource_not_found', 404, 'Este conteúdo não está disponível.');
  return membership;
}
