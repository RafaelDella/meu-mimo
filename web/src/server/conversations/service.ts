import '../only.ts';
import type { CommentPage, CommentView, ConversationView } from '../../contracts/conversations.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import { enqueueCommentCreated } from '../outbox/events.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow, withStoreTransaction } from '../stores/transaction.ts';
import {
  allowedFields, invalidField, operationConflict, operationId, pagination, resourceId,
} from '../stores/validation.ts';
import { requireConversationAccess, requireConversationAudience } from './access.ts';
import { commentSelect, commentView, conversationView } from './views.ts';

/** Somente o módulo da origem chama isto, na mesma transação do registro/ticket. */
export async function registerConversation(scope: StoreScope, input: {
  subjectType: 'SUBMISSION' | 'TICKET'; subjectId: string; participantMembershipId: string;
}): Promise<ConversationView> {
  if (!['SUBMISSION', 'TICKET'].includes(input.subjectType)) invalidField();
  const subjectId = resourceId(input.subjectId);
  const participant = await requireConversationAudience(scope, input.participantMembershipId);
  const key = `meumimo:t05:conversation-subject:${input.subjectType}:${subjectId}`;
  await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const existing = await scope.tx.conversation.findUnique({
    where: { subjectType_subjectId: { subjectType: input.subjectType, subjectId } },
  });
  if (existing) {
    if (existing.storeId !== scope.store.id || existing.participantMembershipId !== participant.id) operationConflict();
    return conversationView(existing);
  }
  const conversation = await scope.tx.conversation.create({ data: {
    storeId: scope.store.id, participantMembershipId: participant.id,
    subjectType: input.subjectType, subjectId,
  } });
  return conversationView(conversation);
}

function commentText(body: Record<string, unknown>): string {
  if (typeof body.text !== 'string') invalidField();
  const text = body.text.trim();
  if (!text || [...text].length > 500 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) || /[\uD800-\uDFFF]/u.test(text)) invalidField();
  return text;
}

export async function listComments(
  identity: Identity, storeId: string, conversationId: string, query = new URLSearchParams(),
): Promise<CommentPage> {
  const page = pagination(query);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const conversation = await requireConversationAccess(scope, conversationId);
    const where = { conversationId: conversation.id };
    const total = await scope.tx.comment.count({ where });
    const comments = await scope.tx.comment.findMany({
      where, select: commentSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: page.skip, take: page.pageSize,
    });
    return {
      conversation: conversationView(conversation), items: comments.map(commentView),
      page: page.page, pageSize: page.pageSize, total,
    };
  });
}

export async function createComment(
  identity: Identity, storeId: string, conversationId: string, body: Record<string, unknown>,
): Promise<CommentView> {
  allowedFields(body, ['operationId', 'text']);
  const id = operationId(body);
  const text = commentText(body);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const conversation = await requireConversationAccess(scope, conversationId);
    const key = `meumimo:t05:comment-operation:${id}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const existing = await scope.tx.comment.findUnique({ where: { id }, select: { ...commentSelect, authorProfileId: true } });
    if (existing) {
      if (existing.conversationId !== conversation.id || existing.authorProfileId !== identity.userId || existing.text !== text) operationConflict();
      return commentView(existing);
    }
    if (conversation.commentsClosedAt) {
      throw new AppError('conversation_read_only', 409, 'Esta conversa está disponível somente para consulta.');
    }
    const comment = await scope.tx.comment.create({
      data: { id, conversationId: conversation.id, authorProfileId: identity.userId, text, createdAt: await databaseNow(scope.tx) },
      select: commentSelect,
    });
    await enqueueCommentCreated(scope.tx, comment.id);
    return commentView(comment);
  });
}
