import { requireIdentity } from '@/server/auth/session';
import { handleRoute } from '@/server/http';
import { uploadMediaPart } from '@/server/media/gateway';

type Context = { params: Promise<{ storeId: string; assetId: string }> };

export function PUT(request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, assetId } = await context.params;
    return Response.json(await uploadMediaPart(await requireIdentity(), storeId, assetId, request));
  });
}
