import { requireIdentity } from '@/server/auth/session';
import { listTicketEvents } from '@/server/redemptions/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; ticketId: string }> };

export function GET(request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, ticketId } = await context.params;
    return Response.json(await listTicketEvents(await requireIdentity(), storeId, ticketId, new URL(request.url).searchParams));
  });
}
