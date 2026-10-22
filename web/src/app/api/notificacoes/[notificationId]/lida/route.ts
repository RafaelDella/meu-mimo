import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { markNotificationRead } from '@/server/notifications/service';
import { allowedFields } from '@/server/stores/validation';

export function POST(request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  return handleRoute(async () => {
    allowedFields(await readJsonObject(request), []);
    return Response.json(await markNotificationRead(await requireIdentity(), (await params).notificationId));
  });
}
