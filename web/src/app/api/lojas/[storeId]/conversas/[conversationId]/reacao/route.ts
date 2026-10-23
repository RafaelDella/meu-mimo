import { requireIdentity } from '@/server/auth/session';
import { readReactions, changeReaction } from '@/server/reactions/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; conversationId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, conversationId } = await context.params;
    return Response.json(await readReactions(await requireIdentity(), storeId, conversationId));
  });
}

export function PUT(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, conversationId } = await context.params;
    return Response.json(await changeReaction(await requireIdentity(), storeId, conversationId, body));
  });
}
