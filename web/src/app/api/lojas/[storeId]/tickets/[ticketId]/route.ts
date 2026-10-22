import { requireIdentity } from '@/server/auth/session';
import { readTicket } from '@/server/redemptions/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; ticketId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, ticketId } = await context.params;
    return Response.json(await readTicket(await requireIdentity(), storeId, ticketId));
  });
}
