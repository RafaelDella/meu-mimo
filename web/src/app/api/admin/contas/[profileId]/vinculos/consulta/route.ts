import { requireIdentity } from '@/server/auth/session';
import { readJsonObject } from '@/server/http';
import { handleAdminRoute } from '@/server/admin/http';
import { readAdminRelations } from '@/server/admin/service';

export function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  return handleAdminRoute('ACCOUNT_RELATIONS', async () => Response.json(await readAdminRelations(await requireIdentity(),
    (await params).profileId, await readJsonObject(request))));
}
