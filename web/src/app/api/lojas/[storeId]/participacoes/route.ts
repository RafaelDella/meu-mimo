import { requireIdentity } from '@/server/auth/session';
import { listMemberships } from '@/server/authorization/queries';
import { handleRoute } from '@/server/http';

export function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  return handleRoute(async () => {
    const { storeId } = await context.params;
    return Response.json(await listMemberships(await requireIdentity(), storeId));
  });
}
