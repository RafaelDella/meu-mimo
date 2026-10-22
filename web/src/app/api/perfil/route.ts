import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { readProfile, updateProfile } from '@/server/stores/profile';

export function GET() {
  return handleRoute(async () => Response.json(await readProfile(await requireIdentity())));
}

export function PATCH(request: Request) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    return Response.json(await updateProfile(await requireIdentity(), body));
  });
}
