import { requireIdentity } from '@/server/auth/session';
import { handleRoute, readJsonObject } from '@/server/http';
import { createStore, listStores } from '@/server/stores/service';

export function GET(request: Request) {
  return handleRoute(async () => Response.json(await listStores(await requireIdentity(), new URL(request.url).searchParams)));
}

export function POST(request: Request) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    return Response.json(await createStore(await requireIdentity(), body), { status: 201 });
  });
}
