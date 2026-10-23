import type { PageResult } from './stores';

export type NotificationKind = 'INVITATION_ACCEPTED' | 'COMMENT_CREATED' | 'SUBMISSION_RECEIVED' | 'SUBMISSION_REVIEWED' | 'SUBMISSION_RESPONDED' | 'REDEMPTION_ISSUED' | 'REDEMPTION_UPDATED' | 'ALBUM_PUBLISHED' | 'NOTE_SENT' | 'REACTION_CHANGED';
export type NotificationTarget = {
  storeId: string; participantMembershipId: string;
} & ({ type: 'membership'; path: string } | { type: 'submission' | 'ticket' | 'note'; subjectId: string; path: string } | {
  type: 'conversation'; conversationId: string; subjectType: 'SUBMISSION' | 'TICKET'; subjectId: string; path: string | null;
});
export type NotificationView = {
  id: string; kind: NotificationKind; storeId: string; storeName: string | null;
  createdAt: string; occurredAt: string; readAt: string | null;
  actor: { displayName: string | null };
};
export type NotificationPage = {
  items: NotificationView[]; page: number; pageSize: number; total: number; unreadCount: number;
};

export type NotificationCategory = 'NOTES' | 'ACTIVITIES' | 'REWARDS' | 'SOCIAL';
export type NotificationGroupView = {
  id: string; version: number; storeId: string; storeName: string | null;
  category: NotificationCategory; count: number; unreadCount: number; attentionActive: boolean;
  latest: NotificationView; firstOccurredAt: string; lastOccurredAt: string; lastDeliveredAt: string;
};
export type NotificationGroupPage = PageResult<NotificationGroupView> & { attentionUnreadCount: number };
export type NotificationPreferences = {
  storeId: string; version: number; socialMuted: boolean; automaticApprovalNotices: boolean;
};
export type PreferencesBody = Pick<NotificationPreferences, 'socialMuted' | 'automaticApprovalNotices'> & {
  operationId: string; expectedVersion: number;
};
export type PreferencesMutation = { preferences: NotificationPreferences; appliedVersion: number };
