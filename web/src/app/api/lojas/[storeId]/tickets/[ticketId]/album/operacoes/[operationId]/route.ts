import { requireIdentity } from '@/server/auth/session';
import { lookupAlbumPublication } from '@/server/albums/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; ticketId: string; operationId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, ticketId, operationId } = await context.params;
    return Response.json(await lookupAlbumPublication(await requireIdentity(), storeId, ticketId, operationId));
  });
}
