import { currentSession } from '@/server/auth/session';
import { handleRoute } from '@/server/http';

export const GET = () => handleRoute(async () => Response.json(await currentSession()));
