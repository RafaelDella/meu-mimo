import { requireIdentity } from '@/server/auth/session';
import { readJsonObject } from '@/server/http';
import { handleAdminRoute } from '@/server/admin/http';
import { searchAdminStores } from '@/server/admin/service';

export function POST(request: Request) {
  return handleAdminRoute('STORE_SEARCH', async () => Response.json(await searchAdminStores(await requireIdentity(), await readJsonObject(request))));
}
