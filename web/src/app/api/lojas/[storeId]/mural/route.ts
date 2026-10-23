import { requireIdentity } from '@/server/auth/session';
import { listFeed } from '@/server/feed/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string }> };

export function GET(request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId } = await context.params;
    return Response.json(await listFeed(await requireIdentity(), storeId, new URL(request.url).searchParams));
  });
}
