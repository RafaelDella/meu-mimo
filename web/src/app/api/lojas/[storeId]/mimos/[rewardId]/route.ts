import { requireIdentity } from '@/server/auth/session';
import { readReward, updateReward } from '@/server/rewards/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; rewardId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, rewardId } = await context.params;
    return Response.json(await readReward(await requireIdentity(), storeId, rewardId));
  });
}

export function PATCH(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request, 16384);
    const { storeId, rewardId } = await context.params;
    return Response.json(await updateReward(await requireIdentity(), storeId, rewardId, body));
  });
}
