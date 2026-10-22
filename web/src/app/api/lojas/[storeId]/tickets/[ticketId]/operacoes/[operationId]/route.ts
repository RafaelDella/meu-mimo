import { requireIdentity } from '@/server/auth/session';
import { lookupTicketTransition } from '@/server/redemptions/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; ticketId: string; operationId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, ticketId, operationId } = await context.params;
    return Response.json(await lookupTicketTransition(await requireIdentity(), storeId, ticketId, operationId));
  });
}
