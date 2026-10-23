import type { ActivityView, PointsBalance } from './activities';
import type { FeedItem } from './feed';
import type { NoteCurrent, ParticipantNoteCurrent } from './notes';
import type { NotificationKind } from './notifications';
import type { TicketStatus, TicketSummary } from './redemptions';
import type { RewardView } from './rewards';
import type { PersonView, StoreView } from './stores';

export type DashboardEvent = {
  id: string; kind: NotificationKind; occurredAt: string; path: string;
  author: { displayName: string | null }; participant: { displayName: string | null };
};
export type MerchantDashboard = {
  store: StoreView;
  counts: { pendingSubmissions: number; outstandingTickets: number; activeParticipants: number };
  checklist: { key: 'PRESENTATION' | 'ACTIVITY' | 'REWARD' | 'INVITATION'; done: boolean; path: string }[];
  pending: { id: string; name: string; participantName: string | null; status: 'PENDING' | 'CONTESTED'; path: string }[];
  tickets: { id: string; name: string; participantName: string | null; status: TicketStatus; path: string }[];
  recent: DashboardEvent[];
};
export type ParticipantDashboard = {
  store: StoreView; person: { displayName: string | null }; merchant: { displayName: string | null };
  points: PointsBalance; activities: ActivityView[]; rewards: RewardView[]; categories: string[];
  note: ParticipantNoteCurrent; tickets: TicketSummary;
};
export type PersonDashboard = {
  person: PersonView; points: PointsBalance; pendingSubmissions: number; outstandingTickets: number;
  recent: FeedItem[]; note: NoteCurrent;
};
