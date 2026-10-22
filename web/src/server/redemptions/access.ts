import '../only.ts';
import type { Redemption } from '../../generated/prisma/client.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { resourceId, unavailable } from '../stores/validation.ts';

export function requireRedeemingParticipant(scope: StoreScope) {
  const actor = requireMembership(scope);
  if (actor.role !== 'PARTICIPANT') unavailable();
  return actor;
}

export async function requireTicket(scope: StoreScope, ticketId: string): Promise<Redemption> {
  requireMembership(scope);
  const ticket = await scope.tx.redemption.findFirst({ where: { id: resourceId(ticketId), storeId: scope.store.id } });
  if (!ticket) unavailable();
  await requireConversationAudience(scope, ticket.participantMembershipId);
  return ticket;
}
