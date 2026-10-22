import '../only.ts';
import type { ReviewEventView, ReviewMutation, SubmissionHistory } from '../../contracts/activities.ts';
import type { Identity } from '../auth/types.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { databaseNow, withStoreTransaction } from '../stores/transaction.ts';
import { pagination, resourceId, unavailable } from '../stores/validation.ts';
import { requireSubmission } from './access.ts';
import { legacyEventView, reviewEventView, reviewInclude } from './review-views.ts';
import { submissionView } from './views.ts';

export async function readReviewOperation(identity: Identity, storeId: string, submissionId: string,
  operationId: string): Promise<ReviewMutation> {
  const id = resourceId(operationId);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const { submission, activity } = await requireSubmission(scope, submissionId);
    const event = await scope.tx.submissionReviewEvent.findFirst({ where: { id, submissionId: submission.id,
      storeId: scope.store.id }, include: reviewInclude });
    if (!event) unavailable();
    return { event: reviewEventView(event), appliedVersion: event.version,
      submission: await submissionView(scope, submission, activity, await databaseNow(scope.tx)) };
  });
}

export async function listSubmissionHistory(identity: Identity, storeId: string, submissionId: string,
  query = new URLSearchParams()): Promise<SubmissionHistory> {
  const page = pagination(query);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const { submission } = await requireSubmission(scope, submissionId);
    const legacyCount = await scope.tx.submissionEvent.count({ where: { submissionId: submission.id, storeId: scope.store.id } });
    const reviewCount = await scope.tx.submissionReviewEvent.count({ where: { submissionId: submission.id, storeId: scope.store.id } });
    const addresses = await scope.tx.$queryRaw<{ id: string; source: string }[]>`
      SELECT id,source FROM (
        SELECT id,'legacy' AS source,"createdAt",CASE WHEN kind='AUTO_APPROVED' THEN 1 ELSE 0 END AS sequence
        FROM app."SubmissionEvent" WHERE "submissionId"=${submission.id}::uuid AND "storeId"=${scope.store.id}::uuid
        UNION ALL
        SELECT id,'review' AS source,"createdAt",version::bigint+2 AS sequence
        FROM app."SubmissionReviewEvent" WHERE "submissionId"=${submission.id}::uuid AND "storeId"=${scope.store.id}::uuid
      ) AS history ORDER BY "createdAt" DESC,sequence DESC,id DESC LIMIT ${page.pageSize} OFFSET ${page.skip}`;
    const legacy = await scope.tx.submissionEvent.findMany({ where: { storeId: scope.store.id, submissionId: submission.id,
      id: { in: addresses.filter(row => row.source === 'legacy').map(row => row.id) } },
      include: { actor: { select: { id: true, displayName: true } } } });
    const reviews = await scope.tx.submissionReviewEvent.findMany({ where: { storeId: scope.store.id, submissionId: submission.id,
      id: { in: addresses.filter(row => row.source === 'review').map(row => row.id) } }, include: reviewInclude });
    const credit = await scope.tx.pointsEntry.findUnique({ where: { sourceKey: `submission.credit:${submission.id}` },
      select: { id: true, amount: true } });
    const items = new Map<string, ReviewEventView>([...legacy.map(row => [`legacy:${row.id}`, legacyEventView(row, submission, credit)] as const),
      ...reviews.map(row => [`review:${row.id}`, reviewEventView(row)] as const)]);
    return { items: addresses.map(row => items.get(`${row.source}:${row.id}`)!), total: legacyCount + reviewCount,
      page: page.page, pageSize: page.pageSize };
  });
}
