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
export type SubmissionView = {
  id: string; storeId: string; activityId: string; participantMembershipId: string;
  participant: { displayName: string | null }; status: 'DRAFT' | 'PENDING' | 'APPROVED';
  pointsState: 'NONE' | 'PENDING' | 'CREDITED'; caption: string;
  createdAt: string; receivedAt: string | null; approvedAt: string | null;
  localDate: string | null; timezone: string | null;
  periodKey: string | null; periodStart: string | null; periodEnd: string | null; occurrenceNumber: number | null;
  activity: ActivityView; snapshot: ActivitySnapshot | null; collectionId: string;
  evidenceAssetId: string | null; conversation: ConversationView | null;
  review: { expectedVersion: number; localDate: string; timezone: string; now: string } | null;
};
export type SubmissionPage = PageResult<SubmissionView>;
export type PointsBalance = {
  storeId: string; participantMembershipId: string; available: string; pending: string;
  today: { localDate: string; timezone: string; submitted: number; approved: number; credited: string };
};
export type PointsEntryView = {
  id: string; storeId: string; participantMembershipId: string; submissionId: string;
  kind: 'ACTIVITY_CREDIT'; amount: string; createdAt: string;
  actor: { displayName: string | null }; activityName: string; path: string;
};
