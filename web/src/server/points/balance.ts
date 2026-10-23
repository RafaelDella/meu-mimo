import '../only.ts';
import type { PointsBalance } from '../../contracts/activities.ts';
import { periodAt } from '../activities/periods.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow } from '../stores/transaction.ts';

/** Consulta reutilizável da relação, sem abrir transação ou consumir outro limite. */
export async function pointsBalance(scope: StoreScope, membershipId: string): Promise<PointsBalance> {
  await requireConversationAudience(scope, membershipId);
  const now = await databaseNow(scope.tx);
  const day = await periodAt(scope.tx, scope.store.timezone, 'DAILY', now);
  const totals = await scope.tx.$queryRaw<{ available: string; pending: string; credited: string; adjusted: string; approved: number }[]>`
    SELECT
      (SELECT COALESCE(sum(amount),0)::text FROM app."PointsEntry"
        WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${membershipId}::uuid) AS available,
      (SELECT COALESCE(sum(points),0)::text FROM app."ActivitySubmission" AS submission
        WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${membershipId}::uuid
        AND status IN ('PENDING','CONTESTED') AND "receivedAt" IS NOT NULL
        AND (SELECT COALESCE(sum(amount),0) FROM app."PointsEntry" WHERE "submissionId"=submission.id)=0) AS pending,
      (SELECT COALESCE(sum(amount),0)::text FROM app."PointsEntry"
        WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${membershipId}::uuid
        AND kind='ACTIVITY_CREDIT' AND "createdAt">=${day.startsAt} AND "createdAt"<${day.endsAt}) AS credited,
      (SELECT COALESCE(sum(amount),0)::text FROM app."PointsEntry"
        WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${membershipId}::uuid
        AND kind IN ('ACTIVITY_REVERSAL','ACTIVITY_RESTORE')
        AND "createdAt">=${day.startsAt} AND "createdAt"<${day.endsAt}) AS adjusted,
      (SELECT count(*)::int FROM app."PointsEntry"
        WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${membershipId}::uuid
        AND kind='ACTIVITY_CREDIT' AND "createdAt">=${day.startsAt} AND "createdAt"<${day.endsAt}) AS approved`;
  const submitted = await scope.tx.activitySubmission.count({ where: { storeId: scope.store.id,
    participantMembershipId: membershipId, receivedAt: { gte: day.startsAt!, lt: day.endsAt! } } });
  return { storeId: scope.store.id, participantMembershipId: membershipId, available: totals[0].available, pending: totals[0].pending,
    today: { localDate: day.localDate, timezone: day.timezone, submitted, approved: totals[0].approved,
      credited: totals[0].credited, adjusted: totals[0].adjusted } };
}
