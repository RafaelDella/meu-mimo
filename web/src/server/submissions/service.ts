import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { SubmissionPage, SubmissionView } from '../../contracts/activities.ts';
import type { Identity } from '../auth/types.ts';
import { requireActivity } from '../activities/access.ts';
import { periodAt } from '../activities/periods.ts';
import { digest } from '../activities/validation.ts';
import { assertActivityOpen, assertOccurrenceAvailable, receivedCount } from '../activities/views.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { registerConversation } from '../conversations/service.ts';
import { AppError } from '../errors.ts';
import { registerMediaCollection, publishMedia } from '../media/registration.ts';
import { setMediaRetention } from '../media/retention.ts';
import { enqueueSubmissionReceived } from '../outbox/events.ts';
import { creditSubmission } from '../points/service.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { assertStoreWritable, databaseNow, requireMembership, withStoreTransaction } from '../stores/transaction.ts';
import { allowedFields, choice, invalidField, operationConflict, operationId, pagination, resourceId, unavailable } from '../stores/validation.ts';
import { requireParticipant, requireSubmission } from './access.ts';
import { localDate, submissionInput } from './validation.ts';
import { submissionView } from './views.ts';

export async function prepareSubmission(identity: Identity, storeId: string, activityId: string,
  body: Record<string, unknown>): Promise<SubmissionView> {
  allowedFields(body, ['operationId']);
  const id = operationId(body);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const participant = requireParticipant(scope);
    const activity = await requireActivity(scope, activityId);
    const key = `meumimo:t07:submission-operation:${id}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const existing = await scope.tx.activitySubmission.findUnique({ where: { id } });
    const now = await databaseNow(scope.tx);
    if (existing) {
      if (existing.storeId !== scope.store.id || existing.activityId !== activity.id ||
          existing.participantMembershipId !== participant.id || existing.authorProfileId !== identity.userId) operationConflict();
      return submissionView(scope, existing, activity, now);
    }
    assertStoreWritable(scope);
    assertActivityOpen(activity);
    const period = await periodAt(scope.tx, scope.store.timezone, activity.frequency, now);
    assertOccurrenceAvailable(await receivedCount(scope, activity.id, participant.id, period), activity);
    const submission = await scope.tx.activitySubmission.create({ data: { id, storeId: scope.store.id, activityId: activity.id,
      participantMembershipId: participant.id, authorProfileId: identity.userId, createdAt: now } });
    await registerMediaCollection(scope, { purpose: 'EVIDENCE', subjectId: submission.id, participantMembershipId: participant.id });
    return submissionView(scope, submission, activity, now);
  });
}

export async function readSubmission(identity: Identity, storeId: string, submissionId: string): Promise<SubmissionView> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const { submission, activity } = await requireSubmission(scope, submissionId);
    return submissionView(scope, submission, activity, await databaseNow(scope.tx));
  });
}

export async function listSubmissions(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<SubmissionPage> {
  const page = pagination(query);
  const status = choice(query, 'status', ['PENDING', 'APPROVED', 'CONTESTED', 'VOIDED'] as const);
  const activityId = query.has('activityId') ? resourceId(query.get('activityId')!) : null;
  const membershipId = query.has('membershipId') ? resourceId(query.get('membershipId')!) : null;
  const from = query.has('from') ? localDate(query.get('from')) : null;
  const to = query.has('to') ? localDate(query.get('to')) : null;
  if (from && to && from > to) invalidField();
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const actor = requireMembership(scope);
    if (activityId) await requireActivity(scope, activityId);
    if (membershipId) await requireConversationAudience(scope, membershipId);
    const where: Prisma.ActivitySubmissionWhereInput = { storeId: scope.store.id, receivedAt: { not: null },
      participant: { accessRevokedAt: null, role: 'PARTICIPANT' },
      ...(status ? { status } : {}), ...(activityId ? { activityId } : {}),
      ...(actor.role === 'PARTICIPANT' ? { participantMembershipId: actor.id } : membershipId ? { participantMembershipId: membershipId } : {}),
      ...(from || to ? { localDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) };
    const total = await scope.tx.activitySubmission.count({ where });
    const rows = await scope.tx.activitySubmission.findMany({ where, include: { activity: true },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.pageSize });
    const now = await databaseNow(scope.tx);
    const items: SubmissionView[] = [];
    for (const row of rows) items.push(await submissionView(scope, row, row.activity, now));
    return { items, total, page: page.page, pageSize: page.pageSize };
  });
}

export { reviewSubmission } from './review.ts';
export { respondToSubmission } from './response.ts';
export { readReviewOperation, listSubmissionHistory } from './history.ts';

export async function submitSubmission(identity: Identity, storeId: string, submissionId: string,
  body: Record<string, unknown>): Promise<SubmissionView> {
  const input = submissionInput(body);
  const requestDigest = digest(input);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const participant = requireParticipant(scope);
    const { submission, activity } = await requireSubmission(scope, submissionId);
    if (submission.authorProfileId !== identity.userId || submission.participantMembershipId !== participant.id) unavailable();
    const now = await databaseNow(scope.tx);
    if (submission.receivedAt) {
      if (submission.requestDigest !== requestDigest) operationConflict();
      return submissionView(scope, submission, activity, now);
    }
    assertStoreWritable(scope);
    assertActivityOpen(activity);
    if (activity.version !== input.expectedVersion) {
      throw new AppError('activity_changed', 409, 'A regra desta atividade mudou. Atualize a revisão antes de enviar.');
    }
    if (scope.store.timezone !== input.expectedTimezone) {
      throw new AppError('timezone_changed', 409, 'O fuso da loja mudou. Atualize a revisão antes de enviar.');
    }
    const period = await periodAt(scope.tx, scope.store.timezone, activity.frequency, now);
    if (period.localDate !== input.expectedLocalDate) {
      throw new AppError('period_changed', 409, 'A data na loja mudou. Revise o registro antes de enviar.');
    }
    const used = await receivedCount(scope, activity.id, participant.id, period);
    assertOccurrenceAvailable(used, activity);
    const collection = await scope.tx.mediaCollection.findUnique({ where: {
      purpose_subjectId: { purpose: 'EVIDENCE', subjectId: submission.id },
    } });
    if (!collection || collection.storeId !== scope.store.id || collection.participantMembershipId !== participant.id) unavailable();
    if (input.evidenceAssetId) {
      const asset = await scope.tx.mediaAsset.findUnique({ where: { id: input.evidenceAssetId } });
      if (!asset || asset.collectionId !== collection.id || asset.authorProfileId !== identity.userId ||
          asset.revision !== collection.revision || asset.mediaType !== 'PHOTO' || asset.removedAt) unavailable();
      if (asset.state !== 'READY') throw new AppError('media_not_ready', 409, 'Aguarde a foto ficar pronta antes de confirmar o registro.');
      await publishMedia(scope, collection.id, [asset.id]);
    }
    const automatic = activity.approvalMode === 'AUTOMATIC';
    const received = await scope.tx.activitySubmission.update({ where: { id: submission.id }, data: {
      status: automatic ? 'APPROVED' : 'PENDING', receivedAt: now, approvedAt: automatic ? now : null, requestDigest,
      activityVersion: activity.version, activityName: activity.name, activityDescription: activity.description,
      activityCategory: activity.category, activitySticker: activity.sticker, points: activity.points,
      frequency: activity.frequency, weeklyLimit: activity.weeklyLimit, approvalMode: activity.approvalMode,
      caption: input.caption, timezone: scope.store.timezone, localDate: period.localDate, periodKey: period.key,
      periodStart: period.startsAt, periodEnd: period.endsAt, occurrenceNumber: used + 1, evidenceAssetId: input.evidenceAssetId,
    } });
    await scope.tx.submissionEvent.create({ data: { storeId: scope.store.id, submissionId: submission.id,
      actorProfileId: identity.userId, kind: 'RECEIVED', createdAt: now } });
    if (automatic) {
      await scope.tx.submissionEvent.create({ data: { storeId: scope.store.id, submissionId: submission.id,
        actorProfileId: identity.userId, kind: 'AUTO_APPROVED', createdAt: now } });
      await creditSubmission(scope, submission.id, now);
    }
    await registerConversation(scope, { subjectType: 'SUBMISSION', subjectId: submission.id, participantMembershipId: participant.id });
    await scope.tx.mediaCollection.update({ where: { id: collection.id }, data: { uploadsClosedAt: now } });
    await setMediaRetention(scope, collection.id, { hold: !automatic, closedAt: null });
    if (!scope.store.domainStartedAt) await scope.tx.store.update({ where: { id: scope.store.id }, data: { domainStartedAt: now } });
    await enqueueSubmissionReceived(scope.tx, submission.id);
    return submissionView(scope, received, activity, now);
  });
}
