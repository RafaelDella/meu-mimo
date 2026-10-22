export type NotificationKind = 'INVITATION_ACCEPTED' | 'COMMENT_CREATED' | 'SUBMISSION_RECEIVED' | 'SUBMISSION_REVIEWED' | 'SUBMISSION_RESPONDED' | 'REDEMPTION_ISSUED';
export type NotificationTarget = {
  storeId: string; participantMembershipId: string;
} & ({ type: 'membership'; path: string } | { type: 'submission' | 'ticket'; subjectId: string; path: string } | {
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
