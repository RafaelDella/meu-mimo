import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { revokeInvitation } from '@/server/invitations/service';
import { allowedFields } from '@/server/stores/validation';

export function POST(request: Request, context: { params: Promise<{ storeId: string; invitationId: string }> }) {
  return handleRoute(async () => {
    allowedFields(await readJsonObject(request), []);
    const { storeId, invitationId } = await context.params;
    return Response.json(await revokeInvitation(await requireIdentity(), storeId, invitationId));
  });
}
