import { requireIdentity } from '@/server/auth/session';
import { handleRoute } from '@/server/http';
import { lookupPreferenceOperation } from '@/server/notifications/preferences';

export function GET(_request: Request, { params }: { params: Promise<{ storeId: string; operationId: string }> }) {
  return handleRoute(async () => {
    const { storeId, operationId } = await params;
    return Response.json(await lookupPreferenceOperation(await requireIdentity(), storeId, operationId));
  });
}
