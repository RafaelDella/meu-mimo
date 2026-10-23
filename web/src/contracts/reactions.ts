export type ReactionEmoji = '❤️' | '👏' | '🥹' | '🔥' | '😂' | '🌷';
export type ReactionState = {
  conversationId: string; version: number; mine: ReactionEmoji | null; writable: boolean;
  reactions: { emoji: ReactionEmoji; author: { id: string; displayName: string | null } }[];
};
export type ReactionBody = { operationId: string; expectedVersion: number; emoji: ReactionEmoji | null };
export type ReactionMutation = {
  state: ReactionState; appliedVersion: number;
  event: { id: string; from: ReactionEmoji | null; to: ReactionEmoji | null; createdAt: string };
};
