import '../only.ts';
import type { ReviewMutation } from '../../contracts/activities.ts';
import type { Identity } from '../auth/types.ts';
import { digest } from '../activities/validation.ts';
import { AppError } from '../errors.ts';
import { publishMedia } from '../media/registration.ts';
import { setMediaRetention } from '../media/retention.ts';
import { enqueueSubmissionReview } from '../outbox/events.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { databaseNow, withStoreTransaction } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import { requireParticipant, requireSubmission } from './access.ts';
import { recoverReview, reviewResult } from './review-operation.ts';
import { assertReviewWritable, currentRequest, evidenceCollection, lockReviewOperation, reviewChanged } from './review-state.ts';
import { responseInput } from './review-validation.ts';

export async function respondToSubmission(identity: Identity, storeId: string, submissionId: string,
  body: Record<string, unknown>): Promise<ReviewMutation> {
  const input = responseInput(body);
  const requestDigest = digest({ kind: 'RESPOND', ...input });
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const participant = requireParticipant(scope);
    const { submission, activity } = await requireSubmission(scope, submissionId);
    if (submission.authorProfileId !== identity.userId || submission.participantMembershipId !== participant.id) unavailable();
    await lockReviewOperation(scope, input.operationId);
    const now = await databaseNow(scope.tx);
    const existing = await recoverReview(scope, submission, activity, input.operationId, requestDigest, now);
    if (existing) return existing;
    await assertReviewWritable(scope, submission);
    const request = await currentRequest(scope, submission.id);
    if (submission.status !== 'CONTESTED' || submission.analysisVersion !== input.expectedVersion || !request ||
        request.id !== input.requestId || request.response || request.evidenceRevision !== input.evidenceRevision) reviewChanged();
    const collection = await evidenceCollection(scope, submission);
    if (collection.revision !== input.evidenceRevision || collection.uploadsClosedAt) reviewChanged();
    if (input.evidenceAssetId) {
      await scope.tx.$queryRaw`SELECT id FROM app."MediaAsset" WHERE id=${input.evidenceAssetId}::uuid FOR UPDATE`;
      const asset = await scope.tx.mediaAsset.findUnique({ where: { id: input.evidenceAssetId } });
      if (!asset || asset.collectionId !== collection.id || asset.authorProfileId !== identity.userId ||
          asset.revision !== input.evidenceRevision || asset.mediaType !== 'PHOTO' || asset.removedAt) unavailable();
      if (asset.state !== 'READY') throw new AppError('media_not_ready', 409, 'Aguarde a foto ficar pronta antes de confirmar o complemento.');
      await publishMedia(scope, collection.id, [asset.id]);
    }
    const updated = await scope.tx.activitySubmission.update({ where: { id: submission.id }, data: { analysisVersion: { increment: 1 } } });
    const event = await scope.tx.submissionReviewEvent.create({ data: {
      id: input.operationId, storeId: scope.store.id, submissionId: submission.id, actorProfileId: identity.userId,
      version: updated.analysisVersion, action: 'RESPOND', fromStatus: 'CONTESTED', toStatus: 'CONTESTED', requestDigest,
      text: input.text, evidenceAssetId: input.evidenceAssetId, evidenceRevision: input.evidenceRevision,
      requestId: request.id, createdAt: now,
    } });
    await scope.tx.mediaCollection.update({ where: { id: collection.id }, data: { uploadsClosedAt: now } });
    await setMediaRetention(scope, collection.id, { hold: true, closedAt: null });
    await enqueueSubmissionReview(scope.tx, event.id);
    return reviewResult(scope, updated, activity, event, now);
  });
}
