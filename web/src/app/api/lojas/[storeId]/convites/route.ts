import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { createInvitation, listInvitations } from '@/server/invitations/service';

type Context = { params: Promise<{ storeId: string }> };

export function GET(request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId } = await context.params;
    return Response.json(await listInvitations(await requireIdentity(), storeId, new URL(request.url).searchParams));
  });
}

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId } = await context.params;
    return Response.json(await createInvitation(await requireIdentity(), storeId, body), { status: 201 });
  });
}
