import { requireIdentity } from '@/server/auth/session';
import { readMerchantDashboard } from '@/server/dashboards/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId } = await context.params;
    return Response.json(await readMerchantDashboard(await requireIdentity(), storeId));
  });
}
