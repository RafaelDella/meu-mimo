import { requireIdentity } from '@/server/auth/session';
import { handleAdminRoute } from '@/server/admin/http';
import { readAdminSession } from '@/server/admin/service';

export const GET = () => handleAdminRoute('SESSION', async () =>
  Response.json(await readAdminSession(await requireIdentity())));
