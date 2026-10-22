import '../only.ts';
import type { Invitation } from '../../generated/prisma/client.ts';
import type { InvitationResult, InvitationView, PageResult } from '../../contracts/stores.ts';
import type { Identity } from '../auth/types.ts';
import { getDb } from '../db/client.ts';
import { getServerEnv } from '../env.ts';
import { AppError } from '../errors.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import {
  assertStoreWritable, databaseNow, requireMerchant, storeAudit, withStoreTransaction,
} from '../stores/transaction.ts';
import { allowedFields, operationConflict, operationId, pagination, resourceId, unavailable } from '../stores/validation.ts';
import { invitationView } from '../stores/views.ts';
import { invitationHash, invitationInvalid, invitationToken, matchesInvitationHash } from './token.ts';
import { enqueueInvitationAccepted } from '../outbox/events.ts';

export async function listInvitations(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<PageResult<InvitationView>> {
  const page = pagination(query);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    const where = { storeId: scope.store.id };
    const total = await scope.tx.invitation.count({ where });
    const rows = await scope.tx.invitation.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.pageSize,
    });
    return { items: rows.map(invitationView), page: page.page, pageSize: page.pageSize, total };
  });
}

export async function createInvitation(
  identity: Identity, storeId: string, body: Record<string, unknown>,
): Promise<InvitationView & { url: string }> {
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
      if (existing.storeId !== scope.store.id || existing.createdByProfileId !== identity.userId ||
          !matchesInvitationHash(token, existing.tokenHash)) operationConflict();
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

export async function revokeInvitation(identity: Identity, storeId: string, invitationId: string): Promise<InvitationView> {
  const id = resourceId(invitationId);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    await scope.tx.$queryRaw`SELECT id FROM app."Invitation" WHERE id = ${id}::uuid AND "storeId" = ${scope.store.id}::uuid FOR UPDATE`;
    const invitation = await scope.tx.invitation.findFirst({ where: { id, storeId: scope.store.id } });
    if (!invitation) unavailable();
    if (invitation.revokedAt) return invitationView(invitation);
    if (invitation.acceptedAt) throw new AppError('invitation_accepted', 409, 'Este convite já foi aceito. A participação pode ser gerenciada em Pessoas.');
    const result = await scope.tx.invitation.update({ where: { id }, data: { revokedAt: await databaseNow(scope.tx) } });
    await storeAudit(scope, 'invitation.revoked', id);
    return invitationView(result);
  });
}

function assertPending(invitation: Invitation, now: Date): void {
  if (invitation.revokedAt) throw new AppError('invitation_revoked', 409, 'Este convite foi revogado. Peça um novo link a quem convidou.');
  if (invitation.acceptedAt) throw new AppError('invitation_accepted', 409, 'Este convite já foi aceito por outra conta.');
  if (invitation.expiresAt.getTime() <= now.getTime()) {
    throw new AppError('invitation_expired', 409, 'Este convite expirou. Peça um novo link a quem convidou.');
  }
}

export async function acceptInvitation(identity: Identity, token: string): Promise<InvitationResult> {
  const tokenHash = invitationHash(token);
  await consumeStoreLimit(identity, 'write');
  const address = await getDb().invitation.findUnique({ where: { tokenHash }, select: { id: true, storeId: true } });
  if (!address) invitationInvalid();
  return withStoreTransaction(identity, address.storeId, async scope => {
    await scope.tx.$queryRaw`SELECT id FROM app."Invitation" WHERE id = ${address.id}::uuid FOR UPDATE`;
    const invitation = await scope.tx.invitation.findFirst({
      where: { id: address.id, storeId: scope.store.id, tokenHash },
    });
    if (!invitation) invitationInvalid();
    const existing = scope.membership;
    if (existing) {
      if (existing.accessRevokedAt) unavailable();
      if (existing.closedAt) throw new AppError('membership_closed', 409, 'Esta participação foi encerrada. Abra a lojinha pela área de histórico.');
      // O acesso já pertence ao vínculo: não consumir outro convite nem criar papel novo.
      return { storeId: scope.store.id, membershipId: existing.id, role: existing.role };
    }
    if (scope.store.state === 'CLOSED') throw new AppError('store_closed', 409, 'Esta lojinha foi encerrada e não recebe novas participações.');
    if (scope.store.state === 'PAUSED') throw new AppError('store_paused', 409, 'Esta lojinha está pausada. Aguarde a retomada para aceitar.');
    const now = await databaseNow(scope.tx);
    assertPending(invitation, now);
    const membership = await scope.tx.membership.create({ data: {
      storeId: scope.store.id, profileId: identity.userId, role: 'PARTICIPANT',
    } });
    await scope.tx.invitation.update({ where: { id: invitation.id }, data: {
      acceptedAt: now, acceptedByProfileId: identity.userId, acceptedMembershipId: membership.id,
    } });
    await storeAudit(scope, 'invitation.accepted', invitation.id);
    await enqueueInvitationAccepted(scope.tx, invitation.id);
    return { storeId: scope.store.id, membershipId: membership.id, role: membership.role };
  });
}
