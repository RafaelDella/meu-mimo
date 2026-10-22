import { requireIdentity } from '@/server/auth/session';
import { readSubmission } from '@/server/submissions/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; submissionId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, submissionId } = await context.params;
    return Response.json(await readSubmission(await requireIdentity(), storeId, submissionId));
  });
}
