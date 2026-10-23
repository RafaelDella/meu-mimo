import { requireIdentity } from '@/server/auth/session';
import { handleAdminRoute } from '@/server/admin/http';
import { readAdminAccount } from '@/server/admin/service';

export function GET(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  return handleAdminRoute('ACCOUNT_DETAIL', async () => Response.json(await readAdminAccount(await requireIdentity(), (await params).profileId)));
}
