import '../only.ts';
import type { Activity, ActivitySubmission, SubmissionReviewEvent } from '../../generated/prisma/client.ts';
import type { ReviewMutation } from '../../contracts/activities.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { operationConflict } from '../stores/validation.ts';
import { reviewEventView, reviewInclude } from './review-views.ts';
import { submissionView } from './views.ts';

export async function recoverReview(scope: StoreScope, submission: ActivitySubmission, activity: Activity,
  operationId: string, requestDigest: string, now: Date): Promise<ReviewMutation | null> {
  const event = await scope.tx.submissionReviewEvent.findUnique({ where: { id: operationId }, include: reviewInclude });
  if (!event) return null;
  if (event.storeId !== scope.store.id || event.submissionId !== submission.id ||
      event.actorProfileId !== scope.identity.userId || event.requestDigest !== requestDigest) operationConflict();
  return { event: reviewEventView(event), submission: await submissionView(scope, submission, activity, now), appliedVersion: event.version };
}

export async function reviewResult(scope: StoreScope, submission: ActivitySubmission, activity: Activity,
  event: SubmissionReviewEvent, now: Date): Promise<ReviewMutation> {
  const row = await scope.tx.submissionReviewEvent.findUniqueOrThrow({ where: { id: event.id }, include: reviewInclude });
  return { event: reviewEventView(row), submission: await submissionView(scope, submission, activity, now), appliedVersion: event.version };
}
