import { callback } from '@/server/auth/flows';
import { handleRoute } from '@/server/http';

export const GET = (request: Request) => handleRoute(() => callback(request));
