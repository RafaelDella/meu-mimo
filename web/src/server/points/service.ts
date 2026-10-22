import '../only.ts';
import type { PageResult } from '../../contracts/stores.ts';
import type { PointsBalance, PointsEntryView } from '../../contracts/activities.ts';
import type { Identity } from '../auth/types.ts';
import { periodAt } from '../activities/periods.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow, requireMembership, withStoreTransaction } from '../stores/transaction.ts';
import { invalidField, operationConflict, pagination, resourceId } from '../stores/validation.ts';

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

async function targetParticipant(scope: StoreScope, query: URLSearchParams): Promise<string> {
  const actor = requireMembership(scope);
  const requested = query.get('membershipId');
  if (!requested && actor.role === 'MERCHANT') invalidField();
  const id = requested ? resourceId(requested) : actor.id;
  return (await requireConversationAudience(scope, id)).id;
}

export async function readPoints(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<PointsBalance> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const membershipId = await targetParticipant(scope, query);
    const now = await databaseNow(scope.tx);
    const day = await periodAt(scope.tx, scope.store.timezone, 'DAILY', now);
    const totals = await scope.tx.$queryRaw<{ available: string; pending: string; credited: string }[]>`
      SELECT
        (SELECT COALESCE(sum(amount),0)::text FROM app."PointsEntry"
          WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${membershipId}::uuid) AS available,
        (SELECT COALESCE(sum(points),0)::text FROM app."ActivitySubmission"
          WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${membershipId}::uuid
          AND status='PENDING' AND "receivedAt" IS NOT NULL) AS pending,
        (SELECT COALESCE(sum(amount),0)::text FROM app."PointsEntry"
          WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${membershipId}::uuid
          AND "createdAt">=${day.startsAt} AND "createdAt"<${day.endsAt}) AS credited`;
    const where = { storeId: scope.store.id, participantMembershipId: membershipId,
      receivedAt: { gte: day.startsAt!, lt: day.endsAt! } };
    const submitted = await scope.tx.activitySubmission.count({ where });
    const approved = await scope.tx.activitySubmission.count({ where: { storeId: scope.store.id,
      participantMembershipId: membershipId, status: 'APPROVED', approvedAt: { gte: day.startsAt!, lt: day.endsAt! } } });
    return { storeId: scope.store.id, participantMembershipId: membershipId, available: totals[0].available, pending: totals[0].pending,
      today: { localDate: day.localDate, timezone: day.timezone, submitted, approved, credited: totals[0].credited } };
  });
}

export async function listPointsEntries(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<PageResult<PointsEntryView>> {
  const page = pagination(query);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const membershipId = await targetParticipant(scope, query);
    const where = { storeId: scope.store.id, participantMembershipId: membershipId };
    const total = await scope.tx.pointsEntry.count({ where });
    const rows = await scope.tx.pointsEntry.findMany({ where,
      include: { actor: { select: { displayName: true } }, submission: { select: { activityName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.pageSize });
    return { items: rows.map(row => ({ id: row.id, storeId: row.storeId, participantMembershipId: row.participantMembershipId,
      submissionId: row.submissionId, kind: 'ACTIVITY_CREDIT', amount: row.amount.toString(), createdAt: row.createdAt.toISOString(),
      actor: row.actor, activityName: row.submission.activityName!, path: `/lojas/${row.storeId}/registros/${row.submissionId}` })),
    total, page: page.page, pageSize: page.pageSize };
  });
}
