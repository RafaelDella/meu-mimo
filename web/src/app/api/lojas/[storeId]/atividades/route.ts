import { requireIdentity } from '@/server/auth/session';
import { createActivity, listActivities } from '@/server/activities/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string }> };

export function GET(request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId } = await context.params;
    return Response.json(await listActivities(await requireIdentity(), storeId, new URL(request.url).searchParams));
  });
}

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId } = await context.params;
    return Response.json(await createActivity(await requireIdentity(), storeId, body), { status: 201 });
  });
}
