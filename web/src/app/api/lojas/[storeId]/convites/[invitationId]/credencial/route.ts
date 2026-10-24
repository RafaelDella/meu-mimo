import { requireIdentity } from '@/server/auth/session';
import { handleRoute } from '@/server/http';
import { readInvitationCredential } from '@/server/invitations/management';

export function GET(_request: Request, context: { params: Promise<{ storeId: string; invitationId: string }> }) {
  return handleRoute(async () => {
    const { storeId, invitationId } = await context.params;
    return Response.json(await readInvitationCredential(await requireIdentity(), storeId, invitationId));
  });
}
