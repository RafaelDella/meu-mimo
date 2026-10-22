import { requireIdentity } from '@/server/auth/session';
import { publishTicketAlbum } from '@/server/albums/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; ticketId: string }> };

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    // Dez legendas de 500 caracteres, inclusive Unicode escapado em JSON.
    const body = await readJsonObject(request, 65_536);
    const { storeId, ticketId } = await context.params;
    return Response.json(await publishTicketAlbum(await requireIdentity(), storeId, ticketId, body));
  });
}
