import { requireIdentity } from '@/server/auth/session';
import { readPersonDashboard } from '@/server/dashboards/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; membershipId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, membershipId } = await context.params;
    return Response.json(await readPersonDashboard(await requireIdentity(), storeId, membershipId));
  });
}
