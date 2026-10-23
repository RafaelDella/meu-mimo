import '../only.ts';
import type { Prisma, Redemption } from '../../generated/prisma/client.ts';
import type { TicketEventView, TicketView } from '../../contracts/redemptions.ts';
import type { RewardSnapshot } from '../../contracts/rewards.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { albumPreview } from '../albums/views.ts';
import { conversationView } from '../conversations/views.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import { cancellationImpact, pendingRequest, ticketActions } from './state.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import type { Suppressions } from '../privacy/suppression.ts';
import { publicAuthor, visibleAuthoredFields, visibleAuthoredText } from '../privacy/views.ts';

export const ticketEventInclude = { actor: { select: { displayName: true } } } satisfies Prisma.RedemptionEventInclude;
type EventRow = Prisma.RedemptionEventGetPayload<{ include: typeof ticketEventInclude }>;

export function ticketEventView(event: EventRow, suppressions: Suppressions): TicketEventView {
  return { id: event.id, kind: event.kind as TicketEventView['kind'], version: event.version,
    fromStatus: event.fromStatus, toStatus: event.toStatus,
    text: visibleAuthoredText(event.text, event.actorProfileId, suppressions), agreementDate: event.agreementDate,
    requestId: event.requestId, delta: event.delta.toString(), restocked: event.restocked,
    stockBefore: event.stockBefore, stockAfter: event.stockAfter, stockRevision: event.stockRevision,
    balanceBefore: event.balanceBefore?.toString() ?? null, balanceAfter: event.balanceAfter?.toString() ?? null,
    createdAt: event.createdAt.toISOString(), author: publicAuthor(event.actor, suppressions.get(event.actorProfileId)) };
}

export async function ticketView(scope: StoreScope, ticket: Redemption, suppressions?: Suppressions): Promise<TicketView> {
  await requireConversationAudience(scope, ticket.participantMembershipId);
  const conversation = await scope.tx.conversation.findUnique({ where: {
    subjectType_subjectId: { subjectType: 'TICKET', subjectId: ticket.id },
  } });
  if (!conversation || conversation.storeId !== scope.store.id || conversation.participantMembershipId !== ticket.participantMembershipId) unavailable();
  const participant = await scope.tx.membership.findUnique({ where: { id: ticket.participantMembershipId },
    select: { profileId: true, profile: { select: { displayName: true } } } });
  if (!participant) unavailable();
  const where = { storeId: scope.store.id, redemptionId: ticket.id };
  const eventsTotal = await scope.tx.redemptionEvent.count({ where });
  const events = await scope.tx.redemptionEvent.findMany({ where, include: ticketEventInclude,
    orderBy: [{ version: 'asc' }, { id: 'asc' }], take: 20 });
  const request = await pendingRequest(scope, ticket);
  const reward = await scope.tx.reward.findUniqueOrThrow({ where: { id: ticket.rewardId }, select: { createdByProfileId: true } });
  const agreement = await scope.tx.redemptionEvent.findFirst({ where: { ...where, kind: 'AGREE' },
    orderBy: { version: 'desc' }, select: { actorProfileId: true } });
  const privacy = suppressions ?? await suppressionFor(scope.tx, [participant.profileId, reward.createdByProfileId,
    ...events.map(row => row.actorProfileId), ...(request ? [request.actorProfileId] : []), ...(agreement ? [agreement.actorProfileId] : [])]);
  const snapshot = visibleAuthoredFields({ rewardVersion: ticket.rewardVersion, name: ticket.rewardName, description: ticket.rewardDescription,
    category: ticket.rewardCategory, sticker: ticket.rewardSticker as RewardSnapshot['sticker'], cost: ticket.rewardCost,
    note: ticket.rewardNote, instructions: ticket.rewardInstructions }, ['name', 'description', 'category', 'note', 'instructions'], reward.createdByProfileId, privacy);
  const actions = ticketActions(scope, ticket);
  return { id: ticket.id, code: ticket.code, storeId: ticket.storeId, rewardId: ticket.rewardId,
    participantMembershipId: ticket.participantMembershipId,
    participant: requireMembership(scope).role === 'MERCHANT' ? publicAuthor(participant.profile, privacy.get(participant.profileId)) : { displayName: null },
    status: ticket.status, createdAt: ticket.createdAt.toISOString(), localDate: ticket.localDate, timezone: ticket.timezone,
    snapshot,
    balanceBefore: ticket.balanceBefore.toString(), balanceAfter: ticket.balanceAfter.toString(),
    conversation: conversationView(conversation), events: events.map(row => ticketEventView(row, privacy)), eventsTotal,
    version: ticket.version, agreementText: agreement ? visibleAuthoredText(ticket.agreementText, agreement.actorProfileId, privacy) : '', agreementDate: ticket.agreementDate,
    fulfilledAt: ticket.fulfilledAt?.toISOString() ?? null, cancelledAt: ticket.cancelledAt?.toISOString() ?? null,
    pendingCancellation: request ? { id: request.id, text: visibleAuthoredText(request.text, request.actorProfileId, privacy), createdAt: request.createdAt.toISOString(),
      fromStatus: request.fromStatus! } : null,
    actions, cancellationImpact: actions.includes('CANCEL') ? await cancellationImpact(scope, ticket) : null,
    album: await albumPreview(scope, ticket.id) };
}
