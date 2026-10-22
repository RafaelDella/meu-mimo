import type { ConversationView } from './conversations';
import type { PageResult } from './stores';

export type ActivityFrequency = 'ONCE' | 'DAILY' | 'WEEKLY';
export type ApprovalMode = 'MANUAL' | 'AUTOMATIC';
export type ActivitySticker = '' | 'gift' | 'coffee' | 'takeout' | 'envelope';
export type ActivityFields = {
  name: string; description: string; category: string; sticker: ActivitySticker;
  points: number; frequency: ActivityFrequency; weeklyLimit: number; approvalMode: ApprovalMode;
};
export type ActivityAvailability = {
  eligible: boolean; used: number; limit: number; remaining: number;
  localDate: string; timezone: string; startsAt: string | null; endsAt: string | null; now: string;
  reason: 'AVAILABLE' | 'LIMIT' | 'STORE_CLOSED' | 'MEMBERSHIP_CLOSED' | 'ARCHIVED';
};
export type ActivityView = ActivityFields & {
  id: string; storeId: string; version: number; createdAt: string; archivedAt: string | null;
  availability: ActivityAvailability | null;
};
export type ActivityPage = PageResult<ActivityView>;
export type ActivityMutation = { activity: ActivityView; appliedVersion: number };
export type ActivitySnapshot = ActivityFields & { activityVersion: number };
export type SubmissionStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'CONTESTED' | 'VOIDED';
export type SubmissionView = {
  id: string; storeId: string; activityId: string; participantMembershipId: string;
  participant: { displayName: string | null }; status: SubmissionStatus;
  pointsState: 'NONE' | 'PENDING' | 'CREDITED' | 'REVERSED'; caption: string;
  createdAt: string; receivedAt: string | null; approvedAt: string | null;
  localDate: string | null; timezone: string | null;
  periodKey: string | null; periodStart: string | null; periodEnd: string | null; occurrenceNumber: number | null;
  activity: ActivityView; snapshot: ActivitySnapshot | null; collectionId: string;
  evidenceAssetId: string | null; conversation: ConversationView | null;
  review: { expectedVersion: number; localDate: string; timezone: string; now: string } | null;
  analysis: SubmissionAnalysis | null;
};
export type SubmissionPage = PageResult<SubmissionView>;
export type PointsBalance = {
  storeId: string; participantMembershipId: string; available: string; pending: string;
  today: { localDate: string; timezone: string; submitted: number; approved: number; credited: string; adjusted: string };
};
export type PointsEntryView = {
  id: string; storeId: string; participantMembershipId: string; submissionId: string;
  kind: PointsKind; amount: string; createdAt: string;
  participant: { displayName: string | null }; actor: { displayName: string | null }; activityName: string; path: string;
  reviewEventId: string | null; compensatesEntryId: string | null;
};
export type ReviewAction = 'APPROVE' | 'CONTEST' | 'VOID' | 'REOPEN';
export type PointsKind = 'ACTIVITY_CREDIT' | 'ACTIVITY_REVERSAL' | 'ACTIVITY_RESTORE';
export type ReviewImpact = { available: string; delta: string; resulting: string };
export type ReviewEventView = {
  id: string; submissionId: string; kind: ReviewAction | 'RESPOND' | 'RECEIVED' | 'AUTO_APPROVED';
  version: number; createdAt: string; author: { id: string; displayName: string | null };
  fromStatus: SubmissionStatus; toStatus: SubmissionStatus; reason: string; text: string;
  evidenceAssetId: string | null; evidenceRevision: number | null; requestId: string | null;
  delta: string; pointsEntryId: string | null;
};
export type SubmissionAnalysis = {
  version: number; actions: ReviewAction[]; canRespond: boolean;
  requestId: string | null; evidenceRevision: number; lastReason: string | null;
  approval: { mode: 'MANUAL' | 'AUTOMATIC'; at: string; author: { displayName: string | null } } | null;
  impacts: Partial<Record<ReviewAction, ReviewImpact>>;
};
export type ReviewMutation = { event: ReviewEventView; submission: SubmissionView; appliedVersion: number };
export type SubmissionHistory = PageResult<ReviewEventView>;
export type ReviewBody = { operationId: string; expectedVersion: number; action: ReviewAction; reason: string; expectedBalance: string };
export type ResponseBody = { operationId: string; expectedVersion: number; requestId: string; evidenceRevision: number; text: string; evidenceAssetId: string | null };
