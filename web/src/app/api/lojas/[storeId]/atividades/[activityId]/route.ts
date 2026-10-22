import { requireIdentity } from '@/server/auth/session';
import { readActivity, updateActivity } from '@/server/activities/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; activityId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, activityId } = await context.params;
    return Response.json(await readActivity(await requireIdentity(), storeId, activityId));
  });
}

export function PATCH(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, activityId } = await context.params;
    return Response.json(await updateActivity(await requireIdentity(), storeId, activityId, body));
  });
}
