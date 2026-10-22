import '../only.ts';
import type { ActivitySubmission, MediaCollection } from '../../generated/prisma/client.ts';
import type { ReviewAction, SubmissionStatus } from '../../contracts/activities.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { AppError } from '../errors.ts';
import { requireMediaCollection } from '../media/access.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { assertStoreWritable, requireMembership } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';

export function reviewChanged(): never {
  throw new AppError('review_changed', 409, 'A análise deste registro mudou. Atualize antes de confirmar.');
}

export function requireReviewer(scope: StoreScope): void {
  if (requireMembership(scope).role !== 'MERCHANT') unavailable();
}

export async function assertReviewWritable(scope: StoreScope, submission: ActivitySubmission): Promise<void> {
  assertStoreWritable(scope, true);
  const participant = await requireConversationAudience(scope, submission.participantMembershipId);
  if (participant.closedAt) throw new AppError('membership_closed', 409, 'Esta participação foi encerrada. O histórico continua disponível.');
}

export async function evidenceCollection(scope: StoreScope, submission: ActivitySubmission): Promise<MediaCollection> {
  const collection = await scope.tx.mediaCollection.findUnique({ where: {
    purpose_subjectId: { purpose: 'EVIDENCE', subjectId: submission.id },
  } });
  if (!collection || collection.storeId !== scope.store.id ||
      collection.participantMembershipId !== submission.participantMembershipId) unavailable();
  return (await requireMediaCollection(scope, collection.id)).collection;
}

export async function currentRequest(scope: StoreScope, submissionId: string) {
  return scope.tx.submissionReviewEvent.findFirst({ where: { storeId: scope.store.id,
    submissionId, action: 'CONTEST' }, include: { response: { select: { id: true } } }, orderBy: { version: 'desc' } });
}

export function actionsFor(status: SubmissionStatus, answered: boolean): ReviewAction[] {
  if (status === 'PENDING') return ['APPROVE', 'CONTEST', 'VOID'];
  if (status === 'APPROVED') return ['CONTEST', 'VOID'];
  if (status === 'CONTESTED') return answered ? ['APPROVE', 'CONTEST', 'VOID'] : ['APPROVE', 'VOID'];
  if (status === 'VOIDED') return ['REOPEN'];
  return [];
}

export function resultingStatus(action: ReviewAction): SubmissionStatus {
  return action === 'APPROVE' ? 'APPROVED' : action === 'CONTEST' ? 'CONTESTED' : action === 'VOID' ? 'VOIDED' : 'PENDING';
}

export async function lockReviewOperation(scope: StoreScope, operationId: string): Promise<void> {
  const key = `meumimo:t08:review-operation:${operationId}`;
  await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
