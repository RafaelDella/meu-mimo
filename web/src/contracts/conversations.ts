export type ConversationSubject = 'SUBMISSION' | 'TICKET';
export type ConversationView = {
  id: string; storeId: string; participantMembershipId: string;
  subjectType: ConversationSubject; subjectId: string; writable: boolean;
};
export type CommentView = {
  id: string; conversationId: string; text: string; createdAt: string;
  author: { id: string; displayName: string | null };
};
export type CommentPage = {
  conversation: ConversationView; items: CommentView[]; page: number; pageSize: number; total: number;
};
