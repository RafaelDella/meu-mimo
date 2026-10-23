import { requireIdentity } from '@/server/auth/session';
import { handleAdminRoute } from '@/server/admin/http';
import { readAdminOverview } from '@/server/admin/service';

export function GET() {
  return handleAdminRoute('OVERVIEW', async () => Response.json(await readAdminOverview(await requireIdentity())));
}
