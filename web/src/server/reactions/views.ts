import '../only.ts';
import type { Conversation } from '../../generated/prisma/client.ts';
import type { ReactionEmoji, ReactionState } from '../../contracts/reactions.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import type { Suppressions } from '../privacy/suppression.ts';
import { publicAuthor } from '../privacy/views.ts';

export async function reactionState(scope: StoreScope, conversation: Conversation, suppressions?: Suppressions): Promise<ReactionState> {
  await requireConversationAudience(scope, conversation.participantMembershipId);
  const rows = await scope.tx.reaction.findMany({ where: { conversationId: conversation.id, storeId: scope.store.id },
    include: { actor: { select: { id: true, displayName: true } } }, orderBy: { actorProfileId: 'asc' } });
  const mine = rows.find(row => row.actorProfileId === scope.identity.userId);
  const privacy = suppressions ?? await suppressionFor(scope.tx, rows.map(row => row.actorProfileId));
  return { conversationId: conversation.id, version: mine?.version ?? 0,
    mine: (mine && !privacy.get(mine.actorProfileId)?.authoredContent ? mine.emoji : null) as ReactionEmoji | null,
    writable: conversation.commentsClosedAt === null,
    reactions: rows.filter(row => row.emoji !== null && !privacy.get(row.actorProfileId)?.authoredContent)
      .map(row => ({ emoji: row.emoji as ReactionEmoji, author: publicAuthor(row.actor, privacy.get(row.actorProfileId)) })) };
}
