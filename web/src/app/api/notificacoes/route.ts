import { requireIdentity } from '@/server/auth/session';
import { handleRoute } from '@/server/http';
import { listNotifications } from '@/server/notifications/service';

export function GET(request: Request) {
  return handleRoute(async () => Response.json(await listNotifications(await requireIdentity(), new URL(request.url).searchParams)));
}
