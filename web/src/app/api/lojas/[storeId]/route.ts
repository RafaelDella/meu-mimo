import { requireIdentity } from '@/server/auth/session';
import { readStore } from '@/server/authorization/queries';
import { handleRoute } from '@/server/http';

export function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  return handleRoute(async () => {
    const { storeId } = await context.params;
    return Response.json(await readStore(await requireIdentity(), storeId));
  });
}
