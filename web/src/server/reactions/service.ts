import '../only.ts';
import { createHash, randomUUID } from 'node:crypto';
import type { Conversation, ReactionEvent } from '../../generated/prisma/client.ts';
import type { ReactionEmoji, ReactionMutation, ReactionState } from '../../contracts/reactions.ts';
import type { Identity } from '../auth/types.ts';
import { requireConversationAccess } from '../conversations/access.ts';
import { AppError } from '../errors.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { enqueueReactionChanged } from '../outbox/events.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow, withStoreTransaction } from '../stores/transaction.ts';
import { allowedFields, invalidField, operationConflict, operationId, resourceId, unavailable } from '../stores/validation.ts';
import { reactionState } from './views.ts';

const emojis = ['❤️', '👏', '🥹', '🔥', '😂', '🌷'];

function reactionInput(body: Record<string, unknown>) {
  allowedFields(body, ['operationId', 'expectedVersion', 'emoji']);
  const id = operationId(body);
  if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 || Number(body.expectedVersion) >= 2_147_483_647 ||
      (body.emoji !== null && (typeof body.emoji !== 'string' || !emojis.includes(body.emoji)))) invalidField();
  const expectedVersion = Number(body.expectedVersion);
  const emoji = body.emoji as ReactionEmoji | null;
  return { id, expectedVersion, emoji,
    requestDigest: createHash('sha256').update(JSON.stringify({ expectedVersion, emoji })).digest('hex') };
}

async function result(scope: StoreScope, conversation: Conversation, event: ReactionEvent): Promise<ReactionMutation> {
  const hidden = (await suppressionFor(scope.tx, [event.actorProfileId])).get(event.actorProfileId)?.authoredContent;
  return { state: await reactionState(scope, conversation), appliedVersion: event.version,
    event: { id: event.id, from: hidden ? null : event.fromEmoji as ReactionEmoji | null, to: hidden ? null : event.toEmoji as ReactionEmoji | null,
      createdAt: event.createdAt.toISOString() } };
}

export async function readReactions(identity: Identity, storeId: string, conversationId: string): Promise<ReactionState> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => reactionState(scope, await requireConversationAccess(scope, conversationId)));
}

export async function changeReaction(identity: Identity, storeId: string, conversationId: string,
  body: Record<string, unknown>): Promise<ReactionMutation> {
  const input = reactionInput(body);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const conversation = await requireConversationAccess(scope, conversationId);
    const key = `meumimo:t12:reaction-operation:${input.id}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const previous = await scope.tx.reactionEvent.findUnique({ where: { id: input.id } });
    if (previous) {
      if (previous.storeId !== scope.store.id || previous.conversationId !== conversation.id ||
          previous.actorProfileId !== identity.userId || previous.requestDigest !== input.requestDigest) operationConflict();
      return result(scope, conversation, previous);
    }
    if (conversation.commentsClosedAt) throw new AppError('conversation_read_only', 409, 'Esta conversa está disponível somente para consulta.');
    const current = await scope.tx.reaction.findUnique({ where: {
      conversationId_actorProfileId: { conversationId: conversation.id, actorProfileId: identity.userId },
    } });
    if ((current?.version ?? 0) !== input.expectedVersion) {
      throw new AppError('reaction_changed', 409, 'Sua reação mudou. Confira a escolha atual antes de tentar novamente.');
    }
    const projection = current ? await scope.tx.reaction.update({ where: { id: current.id },
      data: { emoji: input.emoji, version: { increment: 1 } } }) : await scope.tx.reaction.create({ data: {
      id: randomUUID(), storeId: scope.store.id, conversationId: conversation.id, actorProfileId: identity.userId,
      emoji: input.emoji, version: 1,
    } });
    const event = await scope.tx.reactionEvent.create({ data: { id: input.id, reactionId: projection.id,
      storeId: scope.store.id, conversationId: conversation.id, actorProfileId: identity.userId,
      version: projection.version, fromEmoji: current?.emoji ?? null, toEmoji: input.emoji,
      requestDigest: input.requestDigest, createdAt: await databaseNow(scope.tx) } });
    if (event.toEmoji !== null && event.toEmoji !== event.fromEmoji) await enqueueReactionChanged(scope.tx, event.id);
    return result(scope, conversation, event);
  });
}

export async function lookupReactionOperation(identity: Identity, storeId: string, conversationId: string,
  operationId: string): Promise<{ operation: ReactionMutation | null }> {
  const id = resourceId(operationId);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const conversation = await requireConversationAccess(scope, conversationId);
    const event = await scope.tx.reactionEvent.findUnique({ where: { id } });
    if (!event) return { operation: null };
    if (event.storeId !== scope.store.id || event.conversationId !== conversation.id || event.actorProfileId !== identity.userId) unavailable();
    return { operation: await result(scope, conversation, event) };
  });
}
