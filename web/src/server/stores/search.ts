import '../only.ts';
import type { StoreSearchResult } from '../../contracts/invitations.ts';
import { normalizeInvitationCode } from '../../lib/invitation-code.ts';
import type { Identity } from '../auth/types.ts';
import { resolveCodeInvitation } from '../invitations/resolve.ts';
import { listStores } from './service.ts';
import { allowedFields, choice, invalidField, pagination } from './validation.ts';

export async function searchStores(identity: Identity, body: Record<string, unknown>): Promise<StoreSearchResult> {
  allowedFields(body, ['q', 'role', 'state', 'page', 'pageSize', 'resolveInvitation']);
  if (typeof body.q !== 'string' || /[\u0000-\u001f\u007f]/.test(body.q) || /[\uD800-\uDFFF]/u.test(body.q) ||
    (body.resolveInvitation !== undefined && typeof body.resolveInvitation !== 'boolean')) invalidField();
  const query = new URLSearchParams({ q: body.q });
  for (const field of ['role', 'state', 'page', 'pageSize'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if ((field === 'page' || field === 'pageSize') ? typeof value !== 'number' || !Number.isInteger(value) : typeof value !== 'string') invalidField();
    query.set(field, String(value));
  }
  const page = pagination(query);
  choice(query, 'role', ['MERCHANT', 'PARTICIPANT'] as const);
  choice(query, 'state', ['ACTIVE', 'PAUSED', 'CLOSED', 'ALL'] as const);
  // A busca autorizada por nome continua existindo mesmo que o texto seja um código.
  const stores = await listStores(identity, query);
  const invitation = body.resolveInvitation !== false && normalizeInvitationCode(page.q)
    ? await resolveCodeInvitation(identity, page.q) : null;
  return { stores, invitation };
}
