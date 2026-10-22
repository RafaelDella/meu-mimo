import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { listMedia, reserveMedia } from '@/server/media/service';

type Context = { params: Promise<{ storeId: string; collectionId: string }> };

export function GET(request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, collectionId } = await context.params;
    return Response.json(await listMedia(await requireIdentity(), storeId, collectionId, new URL(request.url).searchParams));
  });
}

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, collectionId } = await context.params;
    return Response.json(await reserveMedia(await requireIdentity(), storeId, collectionId, body), { status: 201 });
  });
}
