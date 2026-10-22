import { requireIdentity } from '@/server/auth/session';
import { readMembership } from '@/server/authorization/queries';
import { handleRoute } from '@/server/http';

export function GET(_request: Request, context: { params: Promise<{ storeId: string; membershipId: string }> }) {
  return handleRoute(async () => {
    const { storeId, membershipId } = await context.params;
    return Response.json(await readMembership(await requireIdentity(), storeId, membershipId));
  });
}
