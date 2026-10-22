import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { acceptInvitation } from '@/server/invitations/service';
import { allowedFields } from '@/server/stores/validation';

export function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  return handleRoute(async () => {
    allowedFields(await readJsonObject(request), []);
    const { token } = await context.params;
    return Response.json(await acceptInvitation(await requireIdentity(), token));
  });
}
