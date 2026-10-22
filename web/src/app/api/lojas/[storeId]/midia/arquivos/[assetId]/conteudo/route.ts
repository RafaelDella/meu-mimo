import { requireIdentity } from '@/server/auth/session';
import { handleRoute } from '@/server/http';
import { readMediaContent } from '@/server/media/gateway';

type Context = { params: Promise<{ storeId: string; assetId: string }> };

export function GET(request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, assetId } = await context.params;
    return readMediaContent(await requireIdentity(), storeId, assetId, request);
  });
}
