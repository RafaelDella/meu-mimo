import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { markNotificationGroupRead } from '@/server/notifications/groups';
import { allowedFields, invalidField } from '@/server/stores/validation';

export function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    allowedFields(body, ['throughVersion']);
    if (typeof body.throughVersion !== 'number') invalidField();
    return Response.json(await markNotificationGroupRead(await requireIdentity(), (await params).groupId, body.throughVersion));
  });
}
