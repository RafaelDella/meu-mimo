import '../only.ts';
import type { Reward } from '../../generated/prisma/client.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { resourceId, unavailable } from '../stores/validation.ts';

export function requireCatalogMerchant(scope: StoreScope): void {
  if (requireMembership(scope).role !== 'MERCHANT') unavailable();
}

export async function requireReward(scope: StoreScope, rewardId: string): Promise<Reward> {
  requireMembership(scope);
  const id = resourceId(rewardId);
  await scope.tx.$queryRaw`SELECT id FROM app."Reward" WHERE id=${id}::uuid AND "storeId"=${scope.store.id}::uuid FOR UPDATE`;
  const reward = await scope.tx.reward.findFirst({ where: { id, storeId: scope.store.id } });
  if (!reward) unavailable();
  return reward;
}
