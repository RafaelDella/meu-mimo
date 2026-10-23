import '../only.ts';
import type { MerchantDashboard, ParticipantDashboard, PersonDashboard } from '../../contracts/dashboards.ts';
import type { ParticipantNoteCurrent } from '../../contracts/notes.ts';
import { activityView } from '../activities/views.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { feedPage } from '../feed/queries.ts';
import { noteCurrent } from '../notes/views.ts';
import { pointsBalance } from '../points/balance.ts';
import { rewardView } from '../rewards/views.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow, requireMembership } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import { personSelect, personView, storeView } from '../stores/views.ts';
import { dashboardEvents, openTicketStatuses, pendingWhere, ticketSummary, ticketWhere } from './queries.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { publicAuthor, visibleAuthoredText } from '../privacy/views.ts';

export async function merchantDashboard(scope: StoreScope): Promise<MerchantDashboard> {
  const actor = requireMembership(scope);
  if (actor.role !== 'MERCHANT') unavailable();
  const pending = pendingWhere(scope);
  const tickets = { ...ticketWhere(scope), status: { in: [...openTicketStatuses] } };
  const pendingRows = await scope.tx.activitySubmission.findMany({ where: pending,
    include: { activity: { select: { createdByProfileId: true } }, participant: { select: { profileId: true, profile: { select: { displayName: true } } } } },
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }], take: 3 });
  const ticketRows = await scope.tx.redemption.findMany({ where: tickets,
    include: { reward: { select: { createdByProfileId: true } }, participant: { select: { profileId: true, profile: { select: { displayName: true } } } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 3 });
  const path = `/lojas/${scope.store.id}`;
  const hasInvitation = !!await scope.tx.invitation.findFirst({ where: { storeId: scope.store.id }, select: { id: true } }) ||
    !!await scope.tx.membership.findFirst({ where: { storeId: scope.store.id, role: 'PARTICIPANT', accessRevokedAt: null }, select: { id: true } });
  const suppressions = await suppressionFor(scope.tx, [scope.store.createdByProfileId,
    ...pendingRows.flatMap(row => [row.activity.createdByProfileId, row.participant.profileId]),
    ...ticketRows.flatMap(row => [row.reward.createdByProfileId, row.participant.profileId])]);
  return { store: storeView(scope.store, actor, suppressions), counts: {
    pendingSubmissions: await scope.tx.activitySubmission.count({ where: pending }),
    outstandingTickets: await scope.tx.redemption.count({ where: tickets }),
    activeParticipants: await scope.tx.membership.count({ where: { storeId: scope.store.id,
      role: 'PARTICIPANT', accessRevokedAt: null, closedAt: null } }) },
  checklist: [
    { key: 'PRESENTATION', done: !!scope.store.presentation.trim(), path: `${path}/configuracoes` },
    { key: 'ACTIVITY', done: !!await scope.tx.activity.findFirst({ where: { storeId: scope.store.id, archivedAt: null }, select: { id: true } }), path: `${path}/atividades` },
    { key: 'REWARD', done: !!await scope.tx.reward.findFirst({ where: { storeId: scope.store.id, archivedAt: null }, select: { id: true } }), path: `${path}/mimos` },
    { key: 'INVITATION', done: hasInvitation, path: `${path}/convites` },
  ],
  pending: pendingRows.map(row => ({ id: row.id, name: visibleAuthoredText(row.activityName!, row.activity.createdByProfileId, suppressions),
    participantName: publicAuthor(row.participant.profile, suppressions.get(row.participant.profileId)).displayName,
    status: row.status as 'PENDING' | 'CONTESTED', path: `${path}/registros/${row.id}` })),
  tickets: ticketRows.map(row => ({ id: row.id, name: visibleAuthoredText(row.rewardName, row.reward.createdByProfileId, suppressions),
    participantName: publicAuthor(row.participant.profile, suppressions.get(row.participant.profileId)).displayName,
    status: row.status, path: `${path}/tickets/${row.id}` })),
  recent: (await dashboardEvents(scope, new URLSearchParams({ pageSize: '5' }))).items };
}

export async function participantDashboard(scope: StoreScope): Promise<ParticipantDashboard> {
  const actor = requireMembership(scope);
  if (actor.role !== 'PARTICIPANT') unavailable();
  const person = await scope.tx.profile.findUniqueOrThrow({ where: { id: actor.profileId }, select: { displayName: true } });
  const merchant = await scope.tx.membership.findFirst({ where: { storeId: scope.store.id,
    role: 'MERCHANT', accessRevokedAt: null }, select: { profileId: true, profile: { select: { displayName: true } } } });
  if (!merchant) unavailable();
  const points = await pointsBalance(scope, actor.id);
  const activityRows = await scope.tx.activity.findMany({ where: { storeId: scope.store.id, archivedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 6 });
  const rewardRows = await scope.tx.reward.findMany({ where: { storeId: scope.store.id, archivedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 6 });
  const categories = await scope.tx.reward.findMany({ where: { storeId: scope.store.id, archivedAt: null,
    creator: { dataSuppressions: { none: { scope: 'AUTHORED_CONTENT' } } } },
    distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } });
  const now = await databaseNow(scope.tx);
  const activities = [];
  const suppressions = await suppressionFor(scope.tx, [scope.store.createdByProfileId, actor.profileId, merchant.profileId,
    ...activityRows.map(row => row.createdByProfileId), ...rewardRows.map(row => row.createdByProfileId)]);
  for (const row of activityRows) activities.push(await activityView(scope, row, now, suppressions));
  const rewards = [];
  const balance = { available: BigInt(points.available), pending: BigInt(points.pending) };
  for (const row of rewardRows) rewards.push(await rewardView(scope, row, balance, suppressions));
  return { store: storeView(scope.store, actor, suppressions), person: publicAuthor(person, suppressions.get(actor.profileId)),
    merchant: publicAuthor(merchant.profile, suppressions.get(merchant.profileId)), points, activities, rewards,
    categories: categories.map(row => row.category).filter(Boolean),
    note: await noteCurrent(scope, actor.id) as ParticipantNoteCurrent, tickets: await ticketSummary(scope, actor.id) };
}

export async function personDashboard(scope: StoreScope, membershipId: string): Promise<PersonDashboard> {
  if (requireMembership(scope).role !== 'MERCHANT') unavailable();
  const participant = await requireConversationAudience(scope, membershipId);
  const person = await scope.tx.membership.findUniqueOrThrow({ where: { id: participant.id }, select: personSelect });
  const tickets = await ticketSummary(scope, participant.id);
  const note = await noteCurrent(scope, participant.id);
  return { person: personView(person, await suppressionFor(scope.tx, [person.profileId])), points: await pointsBalance(scope, participant.id),
    pendingSubmissions: await scope.tx.activitySubmission.count({ where: pendingWhere(scope, participant.id) }),
    outstandingTickets: tickets.outstanding,
    recent: (await feedPage(scope, new URLSearchParams({ participantMembershipId: participant.id, pageSize: '5' }))).items,
    note: { current: note.current, writable: note.writable } };
}
