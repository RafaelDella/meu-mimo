import { requireIdentity } from '@/server/auth/session';
import { archiveReward } from '@/server/rewards/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; rewardId: string }> };

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, rewardId } = await context.params;
    return Response.json(await archiveReward(await requireIdentity(), storeId, rewardId, body));
  });
}
