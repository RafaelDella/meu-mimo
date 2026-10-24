import '../only.ts';
import type { CodeInvitationCreated, ManagedInvitation } from '../../contracts/invitations.ts';
import type { InvitationView, PageResult } from '../../contracts/stores.ts';
import type { Identity } from '../auth/types.ts';
import { getServerEnv } from '../env.ts';
import { AppError } from '../errors.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { assertStoreWritable, databaseNow, requireMerchant, storeAudit, withStoreTransaction } from '../stores/transaction.ts';
import { allowedFields, operationConflict, operationId, pagination, resourceId, unavailable } from '../stores/validation.ts';
import { invitationView } from '../stores/views.ts';
import { createCodeInvitation } from './management.ts';
import { codeInvitationView } from './policy.ts';
import { invitationHash, invitationToken, matchesInvitationHash } from './token.ts';

export { acceptInvitation, acceptInvitationCode } from './acceptance.ts';

export async function listInvitations(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<PageResult<ManagedInvitation>> {
  const page = pagination(query);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    const where = { storeId: scope.store.id };
    const total = await scope.tx.invitation.count({ where });
    const rows = await scope.tx.invitation.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.pageSize,
    });
    const now = await databaseNow(scope.tx);
    return { items: rows.map(row => row.kind === 'CODE' ? codeInvitationView(row, scope.store, now) : invitationView(row)),
      page: page.page, pageSize: page.pageSize, total };
  });
}

export async function createInvitation(identity: Identity, storeId: string, body: Record<string, unknown>): Promise<(InvitationView & { url: string }) | CodeInvitationCreated> {
  if (body.kind === 'CODE') return createCodeInvitation(identity, storeId, body);
  allowedFields(body, ['operationId']);
  const id = operationId(body);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    const key = `meumimo:t04:invitation-operation:${id}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const token = invitationToken(id, scope.store.id, identity.userId);
    const url = `${getServerEnv().appOrigin}/convites/${token}`;
    const existing = await scope.tx.invitation.findUnique({ where: { id } });
    if (existing) {
      if (existing.storeId !== scope.store.id || existing.createdByProfileId !== identity.userId || existing.kind !== 'LEGACY_LINK' || !matchesInvitationHash(token, existing.tokenHash)) operationConflict();
      return { ...invitationView(existing), url };
    }
    assertStoreWritable(scope);
    const now = await databaseNow(scope.tx);
    const invitation = await scope.tx.invitation.create({ data: {
      id, storeId: scope.store.id, createdByProfileId: identity.userId, tokenHash: invitationHash(token),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    } });
    await storeAudit(scope, 'invitation.created', invitation.id);
    return { ...invitationView(invitation), url };
  });
}

export async function revokeInvitation(identity: Identity, storeId: string, invitationId: string): Promise<ManagedInvitation> {
  const id = resourceId(invitationId);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    await scope.tx.$queryRaw`SELECT id FROM app."Invitation" WHERE id = ${id}::uuid AND "storeId" = ${scope.store.id}::uuid FOR UPDATE`;
    const invitation = await scope.tx.invitation.findFirst({ where: { id, storeId: scope.store.id } });
    if (!invitation) unavailable();
    if (invitation.revokedAt) return invitation.kind === 'CODE' ? codeInvitationView(invitation, scope.store, await databaseNow(scope.tx)) : invitationView(invitation);
    if (invitation.kind === 'LEGACY_LINK' && invitation.acceptedAt) throw new AppError('invitation_accepted', 409, 'Este convite já foi aceito. A participação pode ser gerenciada em Pessoas.');
    const now = await databaseNow(scope.tx);
    const result = await scope.tx.invitation.update({ where: { id }, data: { revokedAt: now } });
    await storeAudit(scope, 'invitation.revoked', id);
    return result.kind === 'CODE' ? codeInvitationView(result, scope.store, now) : invitationView(result);
  });
}
