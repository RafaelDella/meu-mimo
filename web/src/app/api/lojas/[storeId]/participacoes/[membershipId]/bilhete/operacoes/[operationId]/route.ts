import { requireIdentity } from '@/server/auth/session';
import { lookupNoteOperation } from '@/server/notes/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; membershipId: string; operationId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, membershipId, operationId } = await context.params;
    return Response.json(await lookupNoteOperation(await requireIdentity(), storeId, membershipId, operationId));
  });
}
