'use client';

import type { TicketEventPage, TicketTransitionBody, TicketTransitionLookup, TicketTransitionMutation, TicketView } from '@/contracts/redemptions';
import { storeRequest } from '@/components/stores/store-api';
import { apiBase } from '@/components/rewards/transport';

export const ticketApiPath = (storeId: string, ticketId: string) => `${apiBase(storeId)}/tickets/${encodeURIComponent(ticketId)}`;
export const ticketApi = {
  read: (storeId: string, ticketId: string, signal: AbortSignal) => storeRequest<TicketView>(ticketApiPath(storeId, ticketId), 'GET', undefined, signal),
  transition: (storeId: string, ticketId: string, body: TicketTransitionBody, signal: AbortSignal) =>
    storeRequest<TicketTransitionMutation>(`${ticketApiPath(storeId, ticketId)}/transicoes`, 'POST', body, signal),
  lookup: (storeId: string, ticketId: string, operationId: string, signal: AbortSignal) =>
    storeRequest<TicketTransitionLookup>(`${ticketApiPath(storeId, ticketId)}/operacoes/${encodeURIComponent(operationId)}`, 'GET', undefined, signal),
};
export type TicketHistory = TicketEventPage;
