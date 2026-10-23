import { requireIdentity } from '@/server/auth/session';
import { handleRoute } from '@/server/http';
import { listNotificationGroups } from '@/server/notifications/groups';

export function GET(request: Request) {
  return handleRoute(async () => Response.json(await listNotificationGroups(await requireIdentity(), new URL(request.url).searchParams)));
}
