'use client';

import type { CommentPage, CommentView } from '@/contracts/conversations';
import { storeRequest } from '@/components/stores/store-api';

export type ConversationContext = { storeId: string; conversationId: string };
export type CommentOperation = { operationId: string; text: string };
export type ConversationTransport = {
  list(context: ConversationContext, page: number, signal: AbortSignal): Promise<CommentPage>;
  send(context: ConversationContext, body: CommentOperation, signal: AbortSignal): Promise<CommentView>;
};

function path(context: ConversationContext) {
  return `/api/lojas/${encodeURIComponent(context.storeId)}/conversas/${encodeURIComponent(context.conversationId)}/comentarios`;
}

export const conversationTransport: ConversationTransport = {
  list: (context, page, signal) => storeRequest(`${path(context)}?page=${page}&pageSize=20`, 'GET', undefined, signal),
  send: (context, body, signal) => storeRequest(path(context), 'POST', body, signal),
};
