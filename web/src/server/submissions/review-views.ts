import '../only.ts';
import type { ActivitySubmission, Prisma } from '../../generated/prisma/client.ts';
import type { ReviewEventView } from '../../contracts/activities.ts';

export const reviewInclude = { actor: { select: { id: true, displayName: true } },
  pointsEntry: { select: { id: true } } } as const;
type ReviewRow = Prisma.SubmissionReviewEventGetPayload<{ include: typeof reviewInclude }>;
export type LegacyRow = Prisma.SubmissionEventGetPayload<{ include: { actor: { select: { id: true; displayName: true } } } }>;

export function reviewEventView(event: ReviewRow): ReviewEventView {
  return { id: event.id, submissionId: event.submissionId, kind: event.action as ReviewEventView['kind'],
    version: event.version, createdAt: event.createdAt.toISOString(), author: event.actor,
    fromStatus: event.fromStatus, toStatus: event.toStatus, reason: event.reason, text: event.text,
    evidenceAssetId: event.evidenceAssetId, evidenceRevision: event.evidenceRevision, requestId: event.requestId,
    delta: event.delta.toString(), pointsEntryId: event.pointsEntry?.id ?? null };
}

export function legacyEventView(event: LegacyRow, submission: ActivitySubmission,
  credit: { id: string; amount: bigint } | null): ReviewEventView {
  const automatic = event.kind === 'AUTO_APPROVED';
  return { id: event.id, submissionId: submission.id, kind: automatic ? 'AUTO_APPROVED' : 'RECEIVED',
    version: 0, createdAt: event.createdAt.toISOString(), author: event.actor,
    fromStatus: automatic ? 'PENDING' : 'DRAFT', toStatus: automatic ? 'APPROVED' : 'PENDING',
    reason: '', text: automatic ? '' : submission.caption,
    evidenceAssetId: automatic ? null : submission.evidenceAssetId, evidenceRevision: automatic ? null : 1,
    requestId: null, delta: automatic ? credit?.amount.toString() ?? '0' : '0',
    pointsEntryId: automatic ? credit?.id ?? null : null };
}
