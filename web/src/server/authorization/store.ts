import '../only.ts';
import type { Identity } from '../auth/types.ts';
import { requireMembership, requireMerchant, withStoreTransaction } from '../stores/transaction.ts';
import { resourceId, unavailable } from '../stores/validation.ts';
import type { AuthorizedStoreContext, StoreAction } from './types.ts';

export async function requireStoreAccess(
  identity: Identity,
  storeId: string,
  action: StoreAction,
  targetMembershipId?: string,
): Promise<AuthorizedStoreContext> {
  if (!['store:read', 'store:manage', 'membership:read', 'membership:list', 'membership:close', 'invitation:manage'].includes(action)) unavailable();
  return withStoreTransaction(identity, storeId, async scope => {
    const membership = requireMembership(scope);
    if (['store:manage', 'membership:list', 'invitation:manage'].includes(action)) requireMerchant(scope);
    if (action === 'membership:read' || action === 'membership:close') {
      if (!targetMembershipId) unavailable();
      const targetId = resourceId(targetMembershipId);
      const target = await scope.tx.membership.findFirst({
        where: { id: targetId, storeId: scope.store.id, accessRevokedAt: null }, select: { profileId: true, role: true },
      });
      if (!target || (membership.role !== 'MERCHANT' && target.profileId !== identity.userId)) unavailable();
      if (action === 'membership:close' && target.role !== 'PARTICIPANT') unavailable();
    }
    return {
      storeId: scope.store.id, actorUserId: identity.userId, role: membership.role,
      membershipId: membership.id, storeState: scope.store.state,
      membershipClosedAt: membership.closedAt?.toISOString() ?? null, targetMembershipId,
    };
  });
}
