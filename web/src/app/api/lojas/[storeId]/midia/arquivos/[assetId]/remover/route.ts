import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { removeMedia } from '@/server/media/service';
import { allowedFields } from '@/server/stores/validation';

type Context = { params: Promise<{ storeId: string; assetId: string }> };

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    allowedFields(await readJsonObject(request), []);
    const { storeId, assetId } = await context.params;
    return Response.json(await removeMedia(await requireIdentity(), storeId, assetId));
  });
}
