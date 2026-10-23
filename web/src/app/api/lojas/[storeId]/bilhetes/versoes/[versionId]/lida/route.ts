import { requireIdentity } from '@/server/auth/session';
import { markNoteVersionRead } from '@/server/notes/service';
import { handleRoute, readJsonObject } from '@/server/http';
import { allowedFields } from '@/server/stores/validation';

type Context = { params: Promise<{ storeId: string; versionId: string }> };

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    allowedFields(body, []);
    const { storeId, versionId } = await context.params;
    return Response.json(await markNoteVersionRead(await requireIdentity(), storeId, versionId));
  });
}
