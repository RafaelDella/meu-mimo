import { requireIdentity } from '@/server/auth/session';
import { listSubmissionHistory } from '@/server/submissions/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; submissionId: string }> };

export function GET(request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, submissionId } = await context.params;
    return Response.json(await listSubmissionHistory(await requireIdentity(), storeId, submissionId, new URL(request.url).searchParams));
  });
}
