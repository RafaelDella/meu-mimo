import '../only.ts';
import type { ActivitySubmission, Prisma } from '../../generated/prisma/client.ts';
import type { ReviewEventView } from '../../contracts/activities.ts';
import type { Suppressions } from '../privacy/suppression.ts';
import { publicAuthor, visibleAuthoredText } from '../privacy/views.ts';

export const reviewInclude = { actor: { select: { id: true, displayName: true } },
  pointsEntry: { select: { id: true } } } as const;
type ReviewRow = Prisma.SubmissionReviewEventGetPayload<{ include: typeof reviewInclude }>;
export type LegacyRow = Prisma.SubmissionEventGetPayload<{ include: { actor: { select: { id: true; displayName: true } } } }>;

export function reviewEventView(event: ReviewRow, suppressions: Suppressions): ReviewEventView {
  const hiddenEvidence = suppressions.get(event.actorProfileId)?.authoredContent || suppressions.get(event.actorProfileId)?.identity;
  return { id: event.id, submissionId: event.submissionId, kind: event.action as ReviewEventView['kind'],
    version: event.version, createdAt: event.createdAt.toISOString(), author: publicAuthor(event.actor, suppressions.get(event.actorProfileId)),
    fromStatus: event.fromStatus, toStatus: event.toStatus, reason: visibleAuthoredText(event.reason, event.actorProfileId, suppressions),
    text: visibleAuthoredText(event.text, event.actorProfileId, suppressions),
    evidenceAssetId: hiddenEvidence ? null : event.evidenceAssetId, evidenceRevision: event.evidenceRevision, requestId: event.requestId,
    delta: event.delta.toString(), pointsEntryId: event.pointsEntry?.id ?? null };
}

export function legacyEventView(event: LegacyRow, submission: ActivitySubmission,
  credit: { id: string; amount: bigint } | null, suppressions: Suppressions): ReviewEventView {
  const automatic = event.kind === 'AUTO_APPROVED';
  const hiddenEvidence = suppressions.get(submission.authorProfileId)?.authoredContent || suppressions.get(submission.authorProfileId)?.identity;
  return { id: event.id, submissionId: submission.id, kind: automatic ? 'AUTO_APPROVED' : 'RECEIVED',
    version: 0, createdAt: event.createdAt.toISOString(), author: publicAuthor(event.actor, suppressions.get(event.actorProfileId)),
    fromStatus: automatic ? 'PENDING' : 'DRAFT', toStatus: automatic ? 'APPROVED' : 'PENDING',
    reason: '', text: automatic ? '' : visibleAuthoredText(submission.caption, submission.authorProfileId, suppressions),
    evidenceAssetId: automatic || hiddenEvidence ? null : submission.evidenceAssetId, evidenceRevision: automatic ? null : 1,
    requestId: null, delta: automatic ? credit?.amount.toString() ?? '0' : '0',
    pointsEntryId: automatic ? credit?.id ?? null : null };
}
