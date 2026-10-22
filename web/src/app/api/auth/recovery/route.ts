import { finishRecovery, requestRecovery } from '@/server/auth/flows';
import { handleRoute } from '@/server/http';

export const POST = (request: Request) => handleRoute(() => requestRecovery(request));
export const PATCH = (request: Request) => handleRoute(() => finishRecovery(request));
