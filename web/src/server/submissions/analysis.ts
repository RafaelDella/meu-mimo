import '../only.ts';
import type { ActivitySubmission, MediaCollection } from '../../generated/prisma/client.ts';
import type { SubmissionAnalysis } from '../../contracts/activities.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { availablePoints, submissionFunding } from '../points/ledger.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { actionsFor, currentRequest } from './review-state.ts';

export async function analysisView(scope: StoreScope, submission: ActivitySubmission, collection: MediaCollection): Promise<{
  analysis: SubmissionAnalysis | null; pointsState: 'NONE' | 'PENDING' | 'CREDITED' | 'REVERSED';
}> {
  if (!submission.receivedAt) return { analysis: null, pointsState: 'NONE' };
  const actor = requireMembership(scope);
  const participant = await requireConversationAudience(scope, submission.participantMembershipId);
  const funding = await submissionFunding(scope, submission.id);
  const request = await currentRequest(scope, submission.id);
  const approval = await scope.tx.submissionReviewEvent.findFirst({ where: { submissionId: submission.id,
    storeId: scope.store.id, action: 'APPROVE' }, include: { actor: { select: { displayName: true } } }, orderBy: { version: 'desc' } });
  const automatic = !approval && submission.approvalMode === 'AUTOMATIC' ? await scope.tx.submissionEvent.findUnique({
    where: { submissionId_kind: { submissionId: submission.id, kind: 'AUTO_APPROVED' } },
    include: { actor: { select: { displayName: true } } },
  }) : null;
  const lastReason = await scope.tx.submissionReviewEvent.findFirst({ where: { submissionId: submission.id,
    storeId: scope.store.id, reason: { not: '' } }, select: { reason: true }, orderBy: { version: 'desc' } });
  const writable = scope.store.state !== 'CLOSED' && !actor.closedAt && !participant.closedAt;
  const actions = writable && actor.role === 'MERCHANT' ? actionsFor(submission.status, Boolean(request?.response)) : [];
  const available = await availablePoints(scope, participant.id);
  const impacts: SubmissionAnalysis['impacts'] = {};
  for (const action of actions) {
    const delta = action === 'APPROVE' && !funding.credited ? BigInt(submission.points!) :
      action === 'VOID' && funding.credited ? -BigInt(submission.points!) : 0n;
    impacts[action] = { available: available.toString(), delta: delta.toString(), resulting: (available + delta).toString() };
  }
  return { pointsState: funding.credited ? 'CREDITED' : funding.terminal ? 'REVERSED' :
    submission.status === 'VOIDED' ? 'NONE' : 'PENDING', analysis: {
    version: submission.analysisVersion, actions,
    canRespond: writable && actor.id === participant.id && submission.authorProfileId === scope.identity.userId &&
      submission.status === 'CONTESTED' && Boolean(request && !request.response),
    requestId: submission.status === 'CONTESTED' ? request?.id ?? null : null,
    evidenceRevision: collection.revision, lastReason: lastReason?.reason ?? null,
    approval: approval ? { mode: 'MANUAL', at: approval.createdAt.toISOString(), author: approval.actor } :
      automatic ? { mode: 'AUTOMATIC', at: automatic.createdAt.toISOString(), author: automatic.actor } : null,
    impacts,
  } };
}
