import { requireIdentity } from '@/server/auth/session';
import { readNoteVersion } from '@/server/notes/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; versionId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, versionId } = await context.params;
    return Response.json(await readNoteVersion(await requireIdentity(), storeId, versionId));
  });
}
