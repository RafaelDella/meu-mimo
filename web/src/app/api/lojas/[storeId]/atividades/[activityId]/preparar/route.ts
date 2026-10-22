import { requireIdentity } from '@/server/auth/session';
import { prepareSubmission } from '@/server/submissions/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; activityId: string }> };

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, activityId } = await context.params;
    return Response.json(await prepareSubmission(await requireIdentity(), storeId, activityId, body), { status: 201 });
  });
}
