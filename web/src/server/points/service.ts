import '../only.ts';
import type { PageResult } from '../../contracts/stores.ts';
import type { PointsBalance, PointsEntryView, PointsKind } from '../../contracts/activities.ts';
import type { Identity } from '../auth/types.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { withStoreTransaction } from '../stores/transaction.ts';
import { choice, invalidField, operationConflict, pagination } from '../stores/validation.ts';
import { localDate } from '../submissions/validation.ts';
import { movementRange, targetParticipant } from './queries.ts';
import { pointsBalance } from './balance.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { publicAuthor, visibleAuthoredText } from '../privacy/views.ts';

/** Somente a origem recebida chama o crédito, dentro da própria transação. */
export async function creditSubmission(scope: StoreScope, submissionId: string, now: Date): Promise<void> {
  const submission = await scope.tx.activitySubmission.findFirst({ where: { id: submissionId, storeId: scope.store.id,
    status: 'APPROVED', approvalMode: 'AUTOMATIC', receivedAt: { not: null } } });
  if (!submission || !submission.points || submission.points < 1 || submission.points > 1_000_000) invalidField();
  const sourceKey = `submission.credit:${submission.id}`;
  const existing = await scope.tx.pointsEntry.findUnique({ where: { sourceKey } });
  if (existing) {
    if (existing.submissionId !== submission.id || existing.storeId !== scope.store.id ||
        existing.participantMembershipId !== submission.participantMembershipId || existing.kind !== 'ACTIVITY_CREDIT' ||
        existing.amount !== BigInt(submission.points) || existing.actorProfileId !== submission.authorProfileId) operationConflict();
    return;
  }
  await scope.tx.pointsEntry.create({ data: { storeId: scope.store.id, participantMembershipId: submission.participantMembershipId,
    submissionId: submission.id, actorProfileId: submission.authorProfileId, kind: 'ACTIVITY_CREDIT',
    amount: BigInt(submission.points), sourceKey, createdAt: now } });
}

export async function readPoints(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<PointsBalance> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const membershipId = (await targetParticipant(scope, query))!;
    return pointsBalance(scope, membershipId);
  });
}

export async function listPointsEntries(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<PageResult<PointsEntryView>> {
  const page = pagination(query);
  const kind = choice(query, 'kind', ['ACTIVITY_CREDIT', 'ACTIVITY_REVERSAL', 'ACTIVITY_RESTORE', 'REDEMPTION_DEBIT', 'REDEMPTION_REFUND'] as const);
  const from = query.has('from') ? localDate(query.get('from')) : null;
  const to = query.has('to') ? localDate(query.get('to')) : null;
  if (from && to && from > to) invalidField();
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const membershipId = await targetParticipant(scope, query, true);
    const where = { storeId: scope.store.id, participant: { accessRevokedAt: null, role: 'PARTICIPANT' as const },
      ...(membershipId ? { participantMembershipId: membershipId } : {}), ...(kind ? { kind } : {}),
      ...(from || to ? { createdAt: await movementRange(scope, from, to) } : {}) };
    const total = await scope.tx.pointsEntry.count({ where });
    const rows = await scope.tx.pointsEntry.findMany({ where,
      include: { actor: { select: { displayName: true } },
        submission: { select: { activityName: true, activity: { select: { createdByProfileId: true } } } },
        redemption: { select: { rewardName: true, reward: { select: { createdByProfileId: true } } } },
        participant: { select: { profileId: true, profile: { select: { displayName: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.pageSize });
    const suppressions = await suppressionFor(scope.tx, rows.flatMap(row => [row.actorProfileId, row.participant.profileId,
      ...(row.submission ? [row.submission.activity.createdByProfileId] : []), ...(row.redemption ? [row.redemption.reward.createdByProfileId] : [])]));
    return { items: rows.map(row => {
      const activityName = row.submission ? visibleAuthoredText(row.submission.activityName!, row.submission.activity.createdByProfileId, suppressions) : null;
      const rewardName = row.redemption ? visibleAuthoredText(row.redemption.rewardName, row.redemption.reward.createdByProfileId, suppressions) : null;
      return { id: row.id, storeId: row.storeId, participantMembershipId: row.participantMembershipId,
      submissionId: row.submissionId, kind: row.kind as PointsKind, amount: row.amount.toString(), createdAt: row.createdAt.toISOString(),
      actor: publicAuthor(row.actor, suppressions.get(row.actorProfileId)), participant: publicAuthor(row.participant.profile, suppressions.get(row.participant.profileId)), activityName,
      redemptionId: row.redemptionId, rewardName,
      origin: row.redemptionId ? { type: 'REDEMPTION' as const, id: row.redemptionId, name: rewardName! } :
        { type: 'SUBMISSION' as const, id: row.submissionId!, name: activityName! },
      reviewEventId: row.reviewEventId, compensatesEntryId: row.compensatesEntryId,
      path: row.redemptionId ? `/lojas/${row.storeId}/tickets/${row.redemptionId}` :
        `/lojas/${row.storeId}/registros/${row.submissionId}${row.reviewEventId ? `?evento=${row.reviewEventId}` : ''}` }; }),
    total, page: page.page, pageSize: page.pageSize };
  });
}
