import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { acceptInvitationCode } from '@/server/invitations/acceptance';
import { allowedFields } from '@/server/stores/validation';

export function POST(request: Request) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    allowedFields(body, ['code']);
    return Response.json(await acceptInvitationCode(await requireIdentity(), body.code));
  });
}
