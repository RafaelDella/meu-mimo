import '../only.ts';
import { getDb } from '../db/client.ts';
import { readAuthSession } from '../auth/sessions.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import type { AuthorizedStoreContext, StoreAction } from './types.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable(): never {
  throw new AppError('resource_not_found', 404, 'Este recurso não está disponível.');
}

export async function requireStoreAccess(
  identity: Identity,
  storeId: string,
  action: StoreAction,
  targetMembershipId?: string,
): Promise<AuthorizedStoreContext> {
  const session = await readAuthSession(identity.sessionId, identity.userId);
  if (session.recovery) {
    throw new AppError('recovery_required', 403, 'Conclua a recuperação da senha para continuar.');
  }
  if (!uuid.test(storeId) ||
      !['store:read', 'membership:read', 'membership:list'].includes(action)) unavailable();

  const memberships = await getDb().membership.findMany({
    where: { storeId, profileId: identity.userId, accessRevokedAt: null },
    select: { role: true },
  });
  const role = memberships.some(membership => membership.role === 'MERCHANT')
    ? 'MERCHANT' : memberships.some(membership => membership.role === 'PARTICIPANT')
      ? 'PARTICIPANT' : null;
  if (!role) unavailable();
  if (action === 'membership:list' && role !== 'MERCHANT') unavailable();

  if (action === 'membership:read') {
    if (!targetMembershipId || !uuid.test(targetMembershipId)) unavailable();
    const target = await getDb().membership.findFirst({
      where: { id: targetMembershipId, storeId, accessRevokedAt: null },
      select: { profileId: true },
    });
    if (!target || (role !== 'MERCHANT' && target.profileId !== identity.userId)) unavailable();
    return { storeId, actorUserId: identity.userId, role, targetMembershipId };
  }
  return { storeId, actorUserId: identity.userId, role };
}
