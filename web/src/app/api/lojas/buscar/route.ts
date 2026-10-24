import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { searchStores } from '@/server/stores/search';

export function POST(request: Request) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    return Response.json(await searchStores(await requireIdentity(), body));
  });
}
