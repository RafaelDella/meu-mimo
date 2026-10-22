import { requireIdentity } from '@/server/auth/session';
import { createReward, listRewards } from '@/server/rewards/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string }> };

export function GET(request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId } = await context.params;
    return Response.json(await listRewards(await requireIdentity(), storeId, new URL(request.url).searchParams));
  });
}

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request, 16384);
    const { storeId } = await context.params;
    return Response.json(await createReward(await requireIdentity(), storeId, body), { status: 201 });
  });
}
