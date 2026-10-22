import '../only.ts';
import type { Redemption } from '../../generated/prisma/client.ts';
import type { TicketView } from '../../contracts/redemptions.ts';
import type { RewardSnapshot } from '../../contracts/rewards.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { conversationView } from '../conversations/views.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';

export async function ticketView(scope: StoreScope, ticket: Redemption): Promise<TicketView> {
  await requireConversationAudience(scope, ticket.participantMembershipId);
  const conversation = await scope.tx.conversation.findUnique({ where: {
    subjectType_subjectId: { subjectType: 'TICKET', subjectId: ticket.id },
  } });
  if (!conversation || conversation.storeId !== scope.store.id || conversation.participantMembershipId !== ticket.participantMembershipId) unavailable();
  const participant = await scope.tx.membership.findUnique({ where: { id: ticket.participantMembershipId },
    select: { profile: { select: { displayName: true } } } });
  if (!participant) unavailable();
  const events = await scope.tx.redemptionEvent.findMany({ where: { storeId: scope.store.id, redemptionId: ticket.id },
    select: { id: true, kind: true, createdAt: true, actor: { select: { displayName: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return { id: ticket.id, code: ticket.code, storeId: ticket.storeId, rewardId: ticket.rewardId,
    participantMembershipId: ticket.participantMembershipId,
    participant: requireMembership(scope).role === 'MERCHANT' ? participant.profile : { displayName: null },
    status: ticket.status, createdAt: ticket.createdAt.toISOString(), localDate: ticket.localDate, timezone: ticket.timezone,
    snapshot: { rewardVersion: ticket.rewardVersion, name: ticket.rewardName, description: ticket.rewardDescription,
      category: ticket.rewardCategory, sticker: ticket.rewardSticker as RewardSnapshot['sticker'], cost: ticket.rewardCost,
      note: ticket.rewardNote, instructions: ticket.rewardInstructions },
    balanceBefore: ticket.balanceBefore.toString(), balanceAfter: ticket.balanceAfter.toString(),
    conversation: conversationView(conversation), events: events.map(event => ({ id: event.id,
      kind: event.kind as 'ISSUED', createdAt: event.createdAt.toISOString(), author: event.actor })) };
}
