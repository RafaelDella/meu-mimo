import { requireIdentity } from '@/server/auth/session';
import { readParticipantNote, sendNote } from '@/server/notes/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; membershipId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, membershipId } = await context.params;
    return Response.json(await readParticipantNote(await requireIdentity(), storeId, membershipId));
  });
}

export function PATCH(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, membershipId } = await context.params;
    return Response.json(await sendNote(await requireIdentity(), storeId, membershipId, body));
  });
}
