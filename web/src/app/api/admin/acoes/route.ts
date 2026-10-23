import { requireIdentity } from '@/server/auth/session';
import { readJsonObject } from '@/server/http';
import { handleAdminRoute } from '@/server/admin/http';
import { applyAdminAction } from '@/server/admin/service';

export function POST(request: Request) {
  return handleAdminRoute('ACTION_APPLY', async () => Response.json(await applyAdminAction(await requireIdentity(), await readJsonObject(request))));
}
