import { requireIdentity } from '@/server/auth/session';
import { handleAdminRoute } from '@/server/admin/http';
import { lookupAdminAction } from '@/server/admin/service';

export function GET(_request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  return handleAdminRoute('ACTION_LOOKUP', async () => Response.json(await lookupAdminAction(await requireIdentity(), (await params).operationId)));
}
