import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { readNotificationPreferences, updateNotificationPreferences } from '@/server/notifications/preferences';

type Context = { params: Promise<{ storeId: string }> };
export function GET(_request: Request, { params }: Context) {
  return handleRoute(async () => Response.json(await readNotificationPreferences(await requireIdentity(), (await params).storeId)));
}
export function PATCH(request: Request, { params }: Context) {
  return handleRoute(async () => Response.json(await updateNotificationPreferences(await requireIdentity(),
    (await params).storeId, await readJsonObject(request))));
}
