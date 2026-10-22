import { requireIdentity } from '@/server/auth/session';
import { createComment, listComments } from '@/server/conversations/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; conversationId: string }> };

export function GET(request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, conversationId } = await context.params;
    return Response.json(await listComments(await requireIdentity(), storeId, conversationId, new URL(request.url).searchParams));
  });
}

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, conversationId } = await context.params;
    return Response.json(await createComment(await requireIdentity(), storeId, conversationId, body), { status: 201 });
  });
}
