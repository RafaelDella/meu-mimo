import { requireIdentity } from '@/server/auth/session';
import { readJsonObject } from '@/server/http';
import { handleAdminRoute } from '@/server/admin/http';
import { readAdminHistory } from '@/server/admin/service';

export function POST(request: Request) {
  return handleAdminRoute('ACTION_HISTORY', async () => Response.json(await readAdminHistory(await requireIdentity(), await readJsonObject(request))));
}
