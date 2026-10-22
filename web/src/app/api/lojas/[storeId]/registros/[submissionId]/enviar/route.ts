import { requireIdentity } from '@/server/auth/session';
import { submitSubmission } from '@/server/submissions/service';
import { handleRoute, readJsonObject } from '@/server/http';

type Context = { params: Promise<{ storeId: string; submissionId: string }> };

export function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const body = await readJsonObject(request);
    const { storeId, submissionId } = await context.params;
    return Response.json(await submitSubmission(await requireIdentity(), storeId, submissionId, body));
  });
}
