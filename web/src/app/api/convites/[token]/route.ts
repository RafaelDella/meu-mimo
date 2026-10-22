import { handleRoute } from '@/server/http';
import { previewInvitation } from '@/server/invitations/preview';

export function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  return handleRoute(async () => {
    const { token } = await context.params;
    const response = Response.json(await previewInvitation(token));
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return response;
  });
}
