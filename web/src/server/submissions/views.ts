import '../only.ts';
import type { Activity, ActivitySubmission } from '../../generated/prisma/client.ts';
import type { ActivitySnapshot, SubmissionView } from '../../contracts/activities.ts';
import { activityView } from '../activities/views.ts';
import { periodAt } from '../activities/periods.ts';
import { conversationView } from '../conversations/views.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import { analysisView } from './analysis.ts';

export function submissionSnapshot(row: ActivitySubmission): ActivitySnapshot | null {
  if (!row.receivedAt) return null;
  return { activityVersion: row.activityVersion!, name: row.activityName!, description: row.activityDescription!,
    category: row.activityCategory!, sticker: row.activitySticker as ActivitySnapshot['sticker'], points: row.points!,
    frequency: row.frequency!, weeklyLimit: row.weeklyLimit!, approvalMode: row.approvalMode! };
}

export async function submissionView(scope: StoreScope, submission: ActivitySubmission, activity: Activity, now: Date): Promise<SubmissionView> {
  const collection = await scope.tx.mediaCollection.findUnique({ where: {
    purpose_subjectId: { purpose: 'EVIDENCE', subjectId: submission.id },
  } });
  if (!collection || collection.storeId !== scope.store.id || collection.participantMembershipId !== submission.participantMembershipId) unavailable();
  const participant = await scope.tx.membership.findUnique({ where: { id: submission.participantMembershipId },
    select: { profile: { select: { displayName: true } } } });
  if (!participant) unavailable();
  const conversation = submission.receivedAt ? await scope.tx.conversation.findUnique({ where: {
    subjectType_subjectId: { subjectType: 'SUBMISSION', subjectId: submission.id },
  } }) : null;
  const currentPeriod = submission.status === 'DRAFT' ? await periodAt(scope.tx, scope.store.timezone, activity.frequency, now) : null;
  const analysis = await analysisView(scope, submission, collection);
  return { id: submission.id, storeId: submission.storeId, activityId: submission.activityId,
    participantMembershipId: submission.participantMembershipId, participant: participant.profile, status: submission.status,
    pointsState: analysis.pointsState, analysis: analysis.analysis,
    caption: submission.caption, createdAt: submission.createdAt.toISOString(), receivedAt: submission.receivedAt?.toISOString() ?? null,
    approvedAt: submission.approvedAt?.toISOString() ?? null, localDate: submission.localDate, timezone: submission.timezone,
    periodKey: submission.periodKey, periodStart: submission.periodStart?.toISOString() ?? null,
    periodEnd: submission.periodEnd?.toISOString() ?? null, occurrenceNumber: submission.occurrenceNumber,
    activity: await activityView(scope, activity, now), snapshot: submissionSnapshot(submission), collectionId: collection.id,
    evidenceAssetId: submission.evidenceAssetId, conversation: conversation ? conversationView(conversation) : null,
    review: currentPeriod ? { expectedVersion: activity.version, localDate: currentPeriod.localDate,
      timezone: currentPeriod.timezone, now: now.toISOString() } : null };
}
