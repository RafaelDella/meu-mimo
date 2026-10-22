import type { ConversationView } from './conversations';
import type { RewardSnapshot } from './rewards';
import type { PageResult } from './stores';

export type TicketStatus = 'WAITING_AGREEMENT' | 'AGREED' | 'FULFILLED' | 'CANCELLATION_REQUESTED' | 'CANCELLED';
export type TicketEventView = {
  id: string; kind: 'ISSUED'; createdAt: string; author: { displayName: string | null };
};
export type TicketView = {
  id: string; code: string; storeId: string; rewardId: string; participantMembershipId: string;
  participant: { displayName: string | null }; status: TicketStatus; createdAt: string;
  localDate: string; timezone: string; snapshot: RewardSnapshot;
  balanceBefore: string; balanceAfter: string; conversation: ConversationView; events: TicketEventView[];
};
export type TicketPage = PageResult<TicketView>;
export type TicketSummary = { total: number; outstanding: number };
export type RedemptionBody = { operationId: string; expectedVersion: number; expectedBalance: string };
export type RedemptionMutation = { ticket: TicketView };
export type RedemptionLookup = { ticket: TicketView | null };
