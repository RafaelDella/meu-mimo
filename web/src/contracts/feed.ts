import type { SubmissionStatus } from './activities';
import type { ReactionState } from './reactions';
import type { TicketStatus } from './redemptions';
import type { PageResult } from './stores';

export type FeedItem = {
  id: string; subjectType: 'SUBMISSION' | 'TICKET'; subjectId: string;
  storeId: string; participantMembershipId: string; participant: { displayName: string | null };
  name: string; status: Exclude<SubmissionStatus, 'DRAFT'> | TicketStatus;
  occurredAt: string; path: string; conversationId: string; summary: string;
  publishedMediaCount: number; preview: { assetId: string; mediaType: 'PHOTO' | 'VIDEO' } | null;
  reactions: ReactionState;
};
export type FeedPage = PageResult<FeedItem>;
