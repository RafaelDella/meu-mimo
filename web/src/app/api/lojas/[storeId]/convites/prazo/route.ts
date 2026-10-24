import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { expirationCandidates } from '@/server/invitations/expiration';

export function POST(request: Request, context: { params: Promise<{ storeId: string }> }) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId } = await context.params;
    return Response.json(await expirationCandidates(await requireIdentity(), storeId, body));
  });
}
