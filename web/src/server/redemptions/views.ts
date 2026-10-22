import '../only.ts';
import type { Prisma, Redemption } from '../../generated/prisma/client.ts';
import type { TicketEventView, TicketView } from '../../contracts/redemptions.ts';
import type { RewardSnapshot } from '../../contracts/rewards.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { conversationView } from '../conversations/views.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import { cancellationImpact, pendingRequest, ticketActions } from './state.ts';

export const ticketEventInclude = { actor: { select: { displayName: true } } } satisfies Prisma.RedemptionEventInclude;
type EventRow = Prisma.RedemptionEventGetPayload<{ include: typeof ticketEventInclude }>;

export function ticketEventView(event: EventRow): TicketEventView {
  return { id: event.id, kind: event.kind as TicketEventView['kind'], version: event.version,
    fromStatus: event.fromStatus, toStatus: event.toStatus, text: event.text, agreementDate: event.agreementDate,
    requestId: event.requestId, delta: event.delta.toString(), restocked: event.restocked,
    stockBefore: event.stockBefore, stockAfter: event.stockAfter, stockRevision: event.stockRevision,
    balanceBefore: event.balanceBefore?.toString() ?? null, balanceAfter: event.balanceAfter?.toString() ?? null,
    createdAt: event.createdAt.toISOString(), author: event.actor };
}

export async function ticketView(scope: StoreScope, ticket: Redemption): Promise<TicketView> {
  await requireConversationAudience(scope, ticket.participantMembershipId);
  const conversation = await scope.tx.conversation.findUnique({ where: {
    subjectType_subjectId: { subjectType: 'TICKET', subjectId: ticket.id },
  } });
  if (!conversation || conversation.storeId !== scope.store.id || conversation.participantMembershipId !== ticket.participantMembershipId) unavailable();
  const participant = await scope.tx.membership.findUnique({ where: { id: ticket.participantMembershipId },
    select: { profile: { select: { displayName: true } } } });
  if (!participant) unavailable();
  const where = { storeId: scope.store.id, redemptionId: ticket.id };
  const eventsTotal = await scope.tx.redemptionEvent.count({ where });
  const events = await scope.tx.redemptionEvent.findMany({ where, include: ticketEventInclude,
    orderBy: [{ version: 'asc' }, { id: 'asc' }], take: 20 });
  const request = await pendingRequest(scope, ticket);
  const actions = ticketActions(scope, ticket);
  return { id: ticket.id, code: ticket.code, storeId: ticket.storeId, rewardId: ticket.rewardId,
    participantMembershipId: ticket.participantMembershipId,
    participant: requireMembership(scope).role === 'MERCHANT' ? participant.profile : { displayName: null },
    status: ticket.status, createdAt: ticket.createdAt.toISOString(), localDate: ticket.localDate, timezone: ticket.timezone,
    snapshot: { rewardVersion: ticket.rewardVersion, name: ticket.rewardName, description: ticket.rewardDescription,
      category: ticket.rewardCategory, sticker: ticket.rewardSticker as RewardSnapshot['sticker'], cost: ticket.rewardCost,
      note: ticket.rewardNote, instructions: ticket.rewardInstructions },
    balanceBefore: ticket.balanceBefore.toString(), balanceAfter: ticket.balanceAfter.toString(),
    conversation: conversationView(conversation), events: events.map(ticketEventView), eventsTotal,
    version: ticket.version, agreementText: ticket.agreementText, agreementDate: ticket.agreementDate,
    fulfilledAt: ticket.fulfilledAt?.toISOString() ?? null, cancelledAt: ticket.cancelledAt?.toISOString() ?? null,
    pendingCancellation: request ? { id: request.id, text: request.text, createdAt: request.createdAt.toISOString(),
      fromStatus: request.fromStatus! } : null,
    actions, cancellationImpact: actions.includes('CANCEL') ? await cancellationImpact(scope, ticket) : null };
}
