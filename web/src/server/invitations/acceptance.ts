import '../only.ts';
import { randomUUID } from 'node:crypto';
import type { Invitation } from '../../generated/prisma/client.ts';
import type { InvitationResult } from '../../contracts/stores.ts';
import { normalizeInvitationCode } from '../../lib/invitation-code.ts';
import type { Identity } from '../auth/types.ts';
import { getDb } from '../db/client.ts';
import { AppError } from '../errors.ts';
import { enqueueInvitationAccepted, enqueueInvitationUseAccepted } from '../outbox/events.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { databaseNow, storeAudit, withStoreTransaction } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import { invitationCodeHash } from './code.ts';
import { consumeInvitationCodeLimit } from './limits.ts';
import { assertCodePending } from './policy.ts';
import { invitationHash, invitationInvalid } from './token.ts';

function assertLegacyPending(invitation: Invitation, now: Date): void {
  if (invitation.revokedAt) throw new AppError('invitation_revoked', 409, 'Este convite foi revogado. Peça um novo link a quem convidou.');
  if (invitation.acceptedAt) throw new AppError('invitation_accepted', 409, 'Este convite já foi aceito por outra conta.');
  if (!invitation.expiresAt || invitation.expiresAt.getTime() <= now.getTime()) {
    throw new AppError('invitation_expired', 409, 'Este convite expirou. Peça um novo link a quem convidou.');
  }
}

async function acceptAddress(identity: Identity, where: { tokenHash: string } | { codeHash: string; kind: string }): Promise<InvitationResult> {
  const address = await getDb().invitation.findFirst({ where, select: { id: true, storeId: true } });
  if (!address) invitationInvalid();
  return withStoreTransaction(identity, address.storeId, async scope => {
    await scope.tx.$queryRaw`SELECT id FROM app."Invitation" WHERE id = ${address.id}::uuid FOR UPDATE`;
    const invitation = await scope.tx.invitation.findFirst({ where: { id: address.id, storeId: scope.store.id, ...where } });
    if (!invitation) invitationInvalid();
    const existing = scope.membership;
    if (existing) {
      if (existing.accessRevokedAt) unavailable();
      if (existing.closedAt) throw new AppError('membership_closed', 409, 'Esta participação foi encerrada. Abra a lojinha pela área de histórico.');
      return { storeId: scope.store.id, membershipId: existing.id, role: existing.role };
    }
    if (scope.store.state === 'CLOSED') throw new AppError('store_closed', 409, 'Esta lojinha foi encerrada e não recebe novas participações.');
    if (scope.store.platformPausedAt) throw new AppError('store_platform_paused', 409, 'Novas ações desta lojinha estão pausadas pela plataforma.');
    if (scope.store.state === 'PAUSED') throw new AppError('store_paused', 409, 'Esta lojinha está pausada. Aguarde a retomada para aceitar.');
    const now = await databaseNow(scope.tx);
    if (invitation.kind === 'CODE') assertCodePending(invitation, scope.store, now);
    else assertLegacyPending(invitation, now);
    const membership = await scope.tx.membership.create({ data: {
      storeId: scope.store.id, profileId: identity.userId, role: 'PARTICIPANT',
    } });
    const usage = await scope.tx.invitationUse.create({ data: {
      id: randomUUID(), invitationId: invitation.id, storeId: scope.store.id,
      profileId: identity.userId, membershipId: membership.id, createdAt: now,
    } });
    await scope.tx.invitation.update({ where: { id: invitation.id }, data: {
      useCount: { increment: 1 }, ...(invitation.kind === 'CODE' ? {} : {
        acceptedAt: now, acceptedByProfileId: identity.userId, acceptedMembershipId: membership.id,
      }),
    } });
    await storeAudit(scope, 'invitation.accepted', invitation.id);
    if (invitation.kind === 'CODE') await enqueueInvitationUseAccepted(scope.tx, usage.id);
    else await enqueueInvitationAccepted(scope.tx, invitation.id);
    return { storeId: scope.store.id, membershipId: membership.id, role: membership.role };
  });
}

export async function acceptInvitation(identity: Identity, token: string): Promise<InvitationResult> {
  const tokenHash = invitationHash(token);
  await consumeStoreLimit(identity, 'write');
  return acceptAddress(identity, { tokenHash });
}

export async function acceptInvitationCode(identity: Identity, code: unknown): Promise<InvitationResult> {
  await consumeInvitationCodeLimit(identity);
  await consumeStoreLimit(identity, 'write');
  const normalized = typeof code === 'string' ? normalizeInvitationCode(code) : null;
  if (!normalized) invitationInvalid();
  return acceptAddress(identity, { codeHash: invitationCodeHash(normalized), kind: 'CODE' });
}
