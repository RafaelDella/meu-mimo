import { requireIdentity } from '@/server/auth/session';
import { handleRoute } from '@/server/http';
import { resolveNotificationGroupTarget } from '@/server/notifications/groups';

export function GET(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  return handleRoute(async () => Response.json(await resolveNotificationGroupTarget(await requireIdentity(), (await params).groupId)));
}
