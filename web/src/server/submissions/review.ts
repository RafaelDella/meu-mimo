import '../only.ts';
import type { ReviewMutation } from '../../contracts/activities.ts';
import type { Identity } from '../auth/types.ts';
import { digest } from '../activities/validation.ts';
import { AppError } from '../errors.ts';
import { nextEvidenceRevision } from '../media/registration.ts';
import { setMediaRetention } from '../media/retention.ts';
import { enqueueSubmissionReview } from '../outbox/events.ts';
import { availablePoints, recordReviewPoints, submissionFunding } from '../points/ledger.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { databaseNow, withStoreTransaction } from '../stores/transaction.ts';
import { requireSubmission } from './access.ts';
import { recoverReview, reviewResult } from './review-operation.ts';
import { actionsFor, assertReviewWritable, currentRequest, evidenceCollection, lockReviewOperation,
  requireReviewer, resultingStatus, reviewChanged } from './review-state.ts';
import { reviewInput } from './review-validation.ts';

export async function reviewSubmission(identity: Identity, storeId: string, submissionId: string,
  body: Record<string, unknown>): Promise<ReviewMutation> {
  const input = reviewInput(body);
  const requestDigest = digest({ kind: 'REVIEW', ...input });
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireReviewer(scope);
    const { submission, activity } = await requireSubmission(scope, submissionId);
    await lockReviewOperation(scope, input.operationId);
    const now = await databaseNow(scope.tx);
    const existing = await recoverReview(scope, submission, activity, input.operationId, requestDigest, now);
    if (existing) return existing;
    await assertReviewWritable(scope, submission);
    const request = await currentRequest(scope, submission.id);
    if (!submission.receivedAt || submission.analysisVersion !== input.expectedVersion ||
        !actionsFor(submission.status, Boolean(request?.response)).includes(input.action)) reviewChanged();
    const available = await availablePoints(scope, submission.participantMembershipId);
    if (available !== BigInt(input.expectedBalance)) {
      throw new AppError('balance_changed', 409, 'O saldo mudou. Atualize o impacto em pontos antes de confirmar.');
    }
    const funding = await submissionFunding(scope, submission.id);
    const delta = input.action === 'APPROVE' && !funding.credited ? BigInt(submission.points!) :
      input.action === 'VOID' && funding.credited ? -BigInt(submission.points!) : 0n;
    const collection = await evidenceCollection(scope, submission);
    const status = resultingStatus(input.action);
    const updated = await scope.tx.activitySubmission.update({ where: { id: submission.id }, data: {
      status, analysisVersion: { increment: 1 },
      ...(input.action === 'APPROVE' && !submission.approvedAt ? { approvedAt: now } : {}),
    } });
    let evidenceRevision: number | null = null;
    if (input.action === 'CONTEST') {
      evidenceRevision = (await nextEvidenceRevision(scope, collection.id)).revision;
    } else {
      await scope.tx.mediaCollection.update({ where: { id: collection.id }, data: { uploadsClosedAt: now } });
    }
    const event = await scope.tx.submissionReviewEvent.create({ data: {
      id: input.operationId, storeId: scope.store.id, submissionId: submission.id, actorProfileId: identity.userId,
      version: updated.analysisVersion, action: input.action, fromStatus: submission.status, toStatus: status,
      reason: input.reason, requestDigest, delta, evidenceRevision, createdAt: now,
    } });
    await recordReviewPoints(scope, updated, event, funding.terminal?.id ?? null);
    await setMediaRetention(scope, collection.id, { hold: status === 'PENDING' || status === 'CONTESTED', closedAt: null });
    await enqueueSubmissionReview(scope.tx, event.id);
    return reviewResult(scope, updated, activity, event, now);
  });
}
