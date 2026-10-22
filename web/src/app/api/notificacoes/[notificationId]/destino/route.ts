import { requireIdentity } from '@/server/auth/session';
import { handleRoute } from '@/server/http';
import { resolveNotificationTarget } from '@/server/notifications/service';

export function GET(_request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  return handleRoute(async () => Response.json(await resolveNotificationTarget(await requireIdentity(), (await params).notificationId)));
}
