import type { ConversationView } from './conversations';
import type { AlbumPreview } from './albums';
import type { RewardSnapshot } from './rewards';
import type { PageResult } from './stores';

export type TicketStatus = 'WAITING_AGREEMENT' | 'AGREED' | 'FULFILLED' | 'CANCELLATION_REQUESTED' | 'CANCELLED';
export type TicketAction = 'AGREE' | 'FULFILL' | 'REQUEST_CANCELLATION' | 'REJECT_CANCELLATION' | 'CANCEL';
export type TicketEventView = {
  id: string; kind: 'ISSUED' | TicketAction; version: number;
  fromStatus: TicketStatus | null; toStatus: TicketStatus; text: string;
  agreementDate: string | null; requestId: string | null; delta: string;
  restocked: boolean; stockBefore: number | null; stockAfter: number | null;
  stockRevision: number | null; balanceBefore: string | null; balanceAfter: string | null;
  createdAt: string; author: { displayName: string | null };
};
export type TicketCancellationImpact = {
  balanceBefore: string; balanceAfter: string; refund: string;
  restock: { eligible: boolean; reason: string; stock: number | null; stockRevision: number };
};
export type TicketView = {
  id: string; code: string; storeId: string; rewardId: string; participantMembershipId: string;
  participant: { displayName: string | null }; status: TicketStatus; createdAt: string;
  localDate: string; timezone: string; snapshot: RewardSnapshot;
  balanceBefore: string; balanceAfter: string; conversation: ConversationView; events: TicketEventView[];
  version: number; agreementText: string; agreementDate: string | null;
  fulfilledAt: string | null; cancelledAt: string | null; eventsTotal: number;
  pendingCancellation: { id: string; text: string; createdAt: string; fromStatus: TicketStatus } | null;
  actions: TicketAction[]; cancellationImpact: TicketCancellationImpact | null;
  album: AlbumPreview;
};
export type TicketPage = PageResult<TicketView>;
export type TicketSummary = { total: number; outstanding: number };
export type RedemptionBody = { operationId: string; expectedVersion: number; expectedBalance: string };
export type RedemptionMutation = { ticket: TicketView };
export type RedemptionLookup = { ticket: TicketView | null };
export type TicketEventPage = PageResult<TicketEventView>;
type TransitionBase = { operationId: string; expectedVersion: number };
export type TicketTransitionBody = TransitionBase & (
  { action: 'AGREE'; text: string; agreementDate: string | null } |
  { action: 'FULFILL' } |
  { action: 'REQUEST_CANCELLATION' | 'REJECT_CANCELLATION'; text: string } |
  { action: 'CANCEL'; text: string; expectedBalance: string; restock: boolean; expectedStockRevision?: number }
);
export type TicketTransitionMutation = { ticket: TicketView; event: TicketEventView; appliedVersion: number };
export type TicketTransitionLookup = { operation: TicketTransitionMutation | null };
