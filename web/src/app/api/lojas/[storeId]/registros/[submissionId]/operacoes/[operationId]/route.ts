import { requireIdentity } from '@/server/auth/session';
import { readReviewOperation } from '@/server/submissions/service';
import { handleRoute } from '@/server/http';

type Context = { params: Promise<{ storeId: string; submissionId: string; operationId: string }> };

export function GET(_request: Request, context: Context) {
  return handleRoute(async () => {
    const { storeId, submissionId, operationId } = await context.params;
    return Response.json(await readReviewOperation(await requireIdentity(), storeId, submissionId, operationId));
  });
}
