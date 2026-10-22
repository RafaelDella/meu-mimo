import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { closeMembership } from '@/server/memberships/service';
import { allowedFields } from '@/server/stores/validation';

export function POST(request: Request, context: { params: Promise<{ storeId: string; membershipId: string }> }) {
  return handleRoute(async () => {
    allowedFields(await readJsonObject(request), []);
    const { storeId, membershipId } = await context.params;
    return Response.json(await closeMembership(await requireIdentity(), storeId, membershipId));
  });
}
