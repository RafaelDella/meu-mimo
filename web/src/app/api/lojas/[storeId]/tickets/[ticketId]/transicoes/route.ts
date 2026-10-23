import { requireIdentity } from '@/server/auth/session';
import { transitionTicket } from '@/server/redemptions/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; ticketId: string }> };

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, ticketId } = await context.params;
    return Response.json(await transitionTicket(await requireIdentity(), storeId, ticketId, body));
  });
}
