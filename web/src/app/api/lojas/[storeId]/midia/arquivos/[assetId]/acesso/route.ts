import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { issueMediaAccess } from '@/server/media/gateway';

type Context = { params: Promise<{ storeId: string; assetId: string }> };

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, assetId } = await context.params;
    return Response.json(await issueMediaAccess(await requireIdentity(), storeId, assetId, body));
  });
}
