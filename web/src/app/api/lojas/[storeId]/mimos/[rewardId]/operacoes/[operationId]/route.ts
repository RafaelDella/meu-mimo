import { requireIdentity } from '@/server/auth/session';
import { lookupRedemption } from '@/server/redemptions/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; rewardId: string; operationId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, rewardId, operationId } = await context.params;
    return Response.json(await lookupRedemption(await requireIdentity(), storeId, rewardId, operationId));
  });
}
