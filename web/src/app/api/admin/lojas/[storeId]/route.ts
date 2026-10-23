import { requireIdentity } from '@/server/auth/session';
import { handleAdminRoute } from '@/server/admin/http';
import { readAdminStore } from '@/server/admin/service';

export function GET(_request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  return handleAdminRoute('STORE_DETAIL', async () => Response.json(await readAdminStore(await requireIdentity(), (await params).storeId)));
}
