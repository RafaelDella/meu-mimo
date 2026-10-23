import { requireIdentity } from '@/server/auth/session';
import { readJsonObject } from '@/server/http';
import { handleAdminRoute } from '@/server/admin/http';
import { searchAdminAccounts } from '@/server/admin/service';

export function POST(request: Request) {
  return handleAdminRoute('ACCOUNT_SEARCH', async () => Response.json(await searchAdminAccounts(await requireIdentity(), await readJsonObject(request))));
}
