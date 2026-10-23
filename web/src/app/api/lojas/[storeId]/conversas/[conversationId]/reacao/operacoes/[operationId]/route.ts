import { requireIdentity } from '@/server/auth/session';
import { lookupReactionOperation } from '@/server/reactions/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; conversationId: string; operationId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, conversationId, operationId } = await context.params;
    return Response.json(await lookupReactionOperation(await requireIdentity(), storeId, conversationId, operationId));
  });
}
