import { signup } from '@/server/auth/flows';
import { handleRoute } from '@/server/http';

export const POST = (request: Request) => handleRoute(() => signup(request));
