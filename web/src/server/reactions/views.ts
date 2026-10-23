import '../only.ts';
import type { Conversation } from '../../generated/prisma/client.ts';
import type { ReactionEmoji, ReactionState } from '../../contracts/reactions.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import type { StoreScope } from '../stores/transaction.ts';

export async function reactionState(scope: StoreScope, conversation: Conversation): Promise<ReactionState> {
  await requireConversationAudience(scope, conversation.participantMembershipId);
  const rows = await scope.tx.reaction.findMany({ where: { conversationId: conversation.id, storeId: scope.store.id },
    include: { actor: { select: { id: true, displayName: true } } }, orderBy: { actorProfileId: 'asc' } });
  const mine = rows.find(row => row.actorProfileId === scope.identity.userId);
  return { conversationId: conversation.id, version: mine?.version ?? 0,
    mine: (mine?.emoji ?? null) as ReactionEmoji | null, writable: conversation.commentsClosedAt === null,
    reactions: rows.filter(row => row.emoji !== null).map(row => ({ emoji: row.emoji as ReactionEmoji, author: row.actor })) };
}
