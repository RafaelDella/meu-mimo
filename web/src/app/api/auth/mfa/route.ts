import { listMfaFactors, processMfa } from '@/server/auth/mfa';
import { handleRoute } from '@/server/http';

export const GET = () => handleRoute(listMfaFactors);
export const POST = (request: Request) => handleRoute(() => processMfa(request));
