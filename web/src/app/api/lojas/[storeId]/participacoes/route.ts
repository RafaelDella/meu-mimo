import { requireIdentity } from '@/server/auth/session';
import { listMemberships } from '@/server/memberships/service';
import { handleRoute } from '@/server/http';

export function GET(request: Request, context: { params: Promise<{ storeId: string }> }) {
  return handleRoute(async () => {
    const { storeId } = await context.params;
    return Response.json(await listMemberships(await requireIdentity(), storeId, new URL(request.url).searchParams));
  });
}
