import '../only.ts';
import type { Activity } from '../../generated/prisma/client.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { resourceId, unavailable } from '../stores/validation.ts';

export async function requireActivity(scope: StoreScope, activityId: string): Promise<Activity> {
  requireMembership(scope);
  const id = resourceId(activityId);
  await scope.tx.$queryRaw`SELECT id FROM app."Activity" WHERE id=${id}::uuid AND "storeId"=${scope.store.id}::uuid FOR UPDATE`;
  const activity = await scope.tx.activity.findFirst({ where: { id, storeId: scope.store.id } });
  if (!activity) unavailable();
  return activity;
}
