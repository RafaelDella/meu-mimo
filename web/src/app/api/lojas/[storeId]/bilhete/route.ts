import { requireIdentity } from '@/server/auth/session';
import { readOwnNote } from '@/server/notes/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId } = await context.params;
    return Response.json(await readOwnNote(await requireIdentity(), storeId));
  });
}
