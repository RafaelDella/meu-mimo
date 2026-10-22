import { requireIdentity } from '@/server/auth/session';
import { handleRoute } from '@/server/http';
import { getMediaAsset } from '@/server/media/service';

type Context = { params: Promise<{ storeId: string; assetId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, assetId } = await context.params;
    return Response.json(await getMediaAsset(await requireIdentity(), storeId, assetId));
  });
}
