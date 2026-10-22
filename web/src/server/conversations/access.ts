import '../only.ts';
import type { Conversation, Membership } from '../../generated/prisma/client.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { resourceId, unavailable } from '../stores/validation.ts';

/** A audiência vem do vínculo participante da origem, nunca do corpo do comentário. */
export async function requireConversationAudience(scope: StoreScope, participantMembershipId: string): Promise<Membership> {
  const actor = requireMembership(scope);
  if (actor.storeId !== scope.store.id || actor.profileId !== scope.identity.userId) unavailable();
  const id = resourceId(participantMembershipId);
  await scope.tx.$queryRaw`
    SELECT id FROM app."Membership"
    WHERE id = ${id}::uuid AND "storeId" = ${scope.store.id}::uuid FOR SHARE`;
  const participant = await scope.tx.membership.findFirst({
    where: { id, storeId: scope.store.id, role: 'PARTICIPANT', accessRevokedAt: null },
  });
  if (!participant || (actor.role !== 'MERCHANT' && actor.id !== participant.id)) unavailable();
  return participant;
}

export async function requireConversationAccess(scope: StoreScope, conversationId: string): Promise<Conversation> {
  const id = resourceId(conversationId);
  const address = await scope.tx.conversation.findFirst({
    where: { id, storeId: scope.store.id }, select: { participantMembershipId: true },
  });
  if (!address) unavailable();
  await requireConversationAudience(scope, address.participantMembershipId);
  await scope.tx.$queryRaw`
    SELECT id FROM app."Conversation"
    WHERE id = ${id}::uuid AND "storeId" = ${scope.store.id}::uuid FOR UPDATE`;
  const conversation = await scope.tx.conversation.findFirst({
    where: { id, storeId: scope.store.id, participantMembershipId: address.participantMembershipId },
  });
  if (!conversation) unavailable();
  return conversation;
}
