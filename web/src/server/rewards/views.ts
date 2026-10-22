import '../only.ts';
import type { Reward } from '../../generated/prisma/client.ts';
import type { RewardAvailability, RewardFields, RewardView } from '../../contracts/rewards.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';

export type RewardBalance = { available: bigint; pending: bigint };

/** Pendência usa somente conquistas; o disponível soma todas as origens do ledger. */
export async function rewardBalance(scope: StoreScope): Promise<RewardBalance | null> {
  const actor = requireMembership(scope);
  if (actor.role !== 'PARTICIPANT') return null;
  const rows = await scope.tx.$queryRaw<{ available: string; pending: string }[]>`
    SELECT
      (SELECT COALESCE(sum(amount),0)::text FROM app."PointsEntry"
        WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${actor.id}::uuid) AS available,
      (SELECT COALESCE(sum(points),0)::text FROM app."ActivitySubmission" AS submission
        WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${actor.id}::uuid
        AND status IN ('PENDING','CONTESTED') AND "receivedAt" IS NOT NULL
        AND (SELECT COALESCE(sum(amount),0) FROM app."PointsEntry" WHERE "submissionId"=submission.id)=0) AS pending`;
  return { available: BigInt(rows[0].available), pending: BigInt(rows[0].pending) };
}

export function rewardConfiguration(reward: Reward): RewardFields {
  return { name: reward.name, description: reward.description, category: reward.category,
    sticker: reward.sticker as RewardFields['sticker'], cost: reward.cost, note: reward.note,
    instructions: reward.instructions, available: reward.available, stock: reward.stock };
}

export function rewardAvailability(scope: StoreScope, reward: Reward, balance: RewardBalance): RewardAvailability {
  const actor = requireMembership(scope);
  const cost = BigInt(reward.cost);
  const reason: RewardAvailability['reason'] = actor.closedAt ? 'MEMBERSHIP_CLOSED' :
    scope.store.state === 'CLOSED' ? 'STORE_CLOSED' : scope.store.state === 'PAUSED' ? 'STORE_PAUSED' :
    reward.archivedAt ? 'ARCHIVED' : !reward.available ? 'UNAVAILABLE' : reward.stock === 0 ? 'SOLD_OUT' :
    balance.available < cost ? 'INSUFFICIENT_POINTS' : 'AVAILABLE';
  return { eligible: reason === 'AVAILABLE', reason, available: balance.available.toString(), pending: balance.pending.toString(),
    resulting: (balance.available - cost).toString(), shortfall: (balance.available < cost ? cost - balance.available : 0n).toString() };
}

export async function rewardView(scope: StoreScope, reward: Reward, balance?: RewardBalance | null): Promise<RewardView> {
  const current = balance === undefined ? await rewardBalance(scope) : balance;
  return { ...rewardConfiguration(reward), id: reward.id, storeId: reward.storeId,
    version: reward.version, stockRevision: reward.stockRevision, createdAt: reward.createdAt.toISOString(),
    archivedAt: reward.archivedAt?.toISOString() ?? null, availability: current ? rewardAvailability(scope, reward, current) : null };
}
