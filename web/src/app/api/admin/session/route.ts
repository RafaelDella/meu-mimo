import { requireIdentity } from '@/server/auth/session';
import { requireAdminAccess } from '@/server/authorization/admin';
import { handleRoute } from '@/server/http';

export const GET = () => handleRoute(async () =>
  Response.json(await requireAdminAccess(await requireIdentity())));
