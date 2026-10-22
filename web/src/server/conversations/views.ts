import '../only.ts';
import type { Conversation } from '../../generated/prisma/client.ts';
import type { CommentView, ConversationView } from '../../contracts/conversations.ts';

export function conversationView(conversation: Conversation): ConversationView {
  return {
    id: conversation.id, storeId: conversation.storeId,
    participantMembershipId: conversation.participantMembershipId,
    subjectType: conversation.subjectType, subjectId: conversation.subjectId,
    writable: conversation.commentsClosedAt === null,
  };
}

export const commentSelect = {
  id: true, conversationId: true, text: true, createdAt: true,
  author: { select: { id: true, displayName: true } },
} as const;

export function commentView(comment: Omit<CommentView, 'createdAt'> & { createdAt: Date }): CommentView {
  return {
    id: comment.id, conversationId: comment.conversationId, text: comment.text,
    createdAt: comment.createdAt.toISOString(),
    author: { id: comment.author.id, displayName: comment.author.displayName },
  };
}
