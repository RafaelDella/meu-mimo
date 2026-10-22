import { requireIdentity } from '@/server/auth/session';
import { archiveActivity } from '@/server/activities/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; activityId: string }> };

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, activityId } = await context.params;
    return Response.json(await archiveActivity(await requireIdentity(), storeId, activityId, body));
  });
}
