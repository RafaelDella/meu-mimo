'use client';

import type { RewardFields, RewardMutation, RewardView } from '@/contracts/rewards';
import type { RedemptionBody, RedemptionLookup, RedemptionMutation, TicketView } from '@/contracts/redemptions';
import { storeRequest } from '@/components/stores/store-api';

export type RewardRoute = { view: 'catalog'; query: string } | { view: 'new' } |
  { view: 'detail'; rewardId: string; operationId?: string } | { view: 'edit'; rewardId: string } |
  { view: 'tickets'; query: string } | { view: 'ticket'; ticketId: string; returnTo?: string };
export const apiBase = (storeId: string) => `/api/lojas/${encodeURIComponent(storeId)}`;
export const rewardPath = (storeId: string, rewardId?: string) => `/lojas/${encodeURIComponent(storeId)}/mimos${rewardId ? `/${encodeURIComponent(rewardId)}` : ''}`;
export const ticketPath = (storeId: string, ticketId?: string) => `/lojas/${encodeURIComponent(storeId)}/tickets${ticketId ? `/${encodeURIComponent(ticketId)}` : ''}`;
type Version = { operationId: string; expectedVersion: number; expectedStockRevision: number };
export const rewardApi = {
  read: (storeId: string, id: string, signal: AbortSignal) => storeRequest<RewardView>(`${apiBase(storeId)}/mimos/${encodeURIComponent(id)}`, 'GET', undefined, signal),
  create: (storeId: string, body: RewardFields & { operationId: string }, signal: AbortSignal) => storeRequest<RewardMutation>(`${apiBase(storeId)}/mimos`, 'POST', body, signal),
  update: (storeId: string, id: string, body: RewardFields & Version, signal: AbortSignal) => storeRequest<RewardMutation>(`${apiBase(storeId)}/mimos/${encodeURIComponent(id)}`, 'PATCH', body, signal),
  archive: (storeId: string, id: string, body: Version, signal: AbortSignal) => storeRequest<RewardMutation>(`${apiBase(storeId)}/mimos/${encodeURIComponent(id)}/arquivar`, 'POST', body, signal),
  redeem: (storeId: string, id: string, body: RedemptionBody, signal: AbortSignal) => storeRequest<RedemptionMutation>(`${apiBase(storeId)}/mimos/${encodeURIComponent(id)}/resgatar`, 'POST', body, signal),
  lookup: (storeId: string, rewardId: string, id: string, signal: AbortSignal) => storeRequest<RedemptionLookup>(`${apiBase(storeId)}/mimos/${encodeURIComponent(rewardId)}/operacoes/${encodeURIComponent(id)}`, 'GET', undefined, signal),
  ticket: (storeId: string, id: string, signal: AbortSignal) => storeRequest<TicketView>(`${apiBase(storeId)}/tickets/${encodeURIComponent(id)}`, 'GET', undefined, signal),
};
