import type { PageResult } from './stores';
import type { Illustration } from './illustrations';

export type RewardSticker = Illustration;
export type RewardFields = {
  name: string; description: string; category: string; sticker: RewardSticker;
  cost: number; note: string; instructions: string; available: boolean; stock: number | null;
};
export type RewardAvailability = {
  eligible: boolean;
  reason: 'AVAILABLE' | 'INSUFFICIENT_POINTS' | 'SOLD_OUT' | 'UNAVAILABLE' | 'ARCHIVED' | 'STORE_PAUSED' | 'STORE_PLATFORM_PAUSED' | 'STORE_CLOSED' | 'MEMBERSHIP_CLOSED';
  available: string; pending: string; resulting: string; shortfall: string;
};
export type RewardView = RewardFields & {
  id: string; storeId: string; version: number; stockRevision: number;
  createdAt: string; archivedAt: string | null; availability: RewardAvailability | null;
};
export type RewardPage = PageResult<RewardView> & { categories: string[] };
export type RewardMutation = { reward: RewardView; appliedVersion: number };
export type RewardSnapshot = Pick<RewardFields, 'name' | 'description' | 'category' | 'sticker' | 'cost' | 'note' | 'instructions'> & { rewardVersion: number };
