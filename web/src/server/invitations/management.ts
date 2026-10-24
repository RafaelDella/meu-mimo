import '../only.ts';
import type { Invitation } from '../../generated/prisma/client.ts';
import type { CodeInvitationCreated, InvitationCredential } from '../../contracts/invitations.ts';
import type { Identity } from '../auth/types.ts';
import { getServerEnv } from '../env.ts';
import { AppError } from '../errors.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { assertStoreWritable, databaseNow, requireMerchant, storeAudit, withStoreTransaction } from '../stores/transaction.ts';
import { operationConflict, resourceId, unavailable } from '../stores/validation.ts';
import { deriveInvitationCode, invitationCodeHash, matchesCodeHash } from './code.ts';
import { invitationExpiration } from './expiration.ts';
import { codeInvitationView } from './policy.ts';
import { invitationHash, invitationToken, matchesInvitationHash } from './token.ts';
import { creationDigest, parseCodeInvitation } from './validation.ts';

function credential(invitation: Invitation): InvitationCredential {
  if (invitation.kind !== 'CODE' || invitation.codeNonce === null || !invitation.codeHash) unavailable();
  const code = deriveInvitationCode(invitation.id, invitation.storeId, invitation.createdByProfileId, invitation.codeNonce);
  const token = invitationToken(invitation.id, invitation.storeId, invitation.createdByProfileId);
  if (!matchesCodeHash(code, invitation.codeHash) || !matchesInvitationHash(token, invitation.tokenHash)) {
    throw new AppError('invitation_credential_unavailable', 409, 'A credencial deste convite não pode ser recuperada. Revogue e gere outro convite.');
  }
  return { id: invitation.id, code, url: `${getServerEnv().appOrigin}/convites/${token}` };
}

export async function createCodeInvitation(identity: Identity, storeId: string, body: Record<string, unknown>): Promise<CodeInvitationCreated> {
  const input = parseCodeInvitation(body);
  const digest = creationDigest(input);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    const key = `meumimo:t04:invitation-operation:${input.operationId}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const existing = await scope.tx.invitation.findUnique({ where: { id: input.operationId } });
    if (existing) {
      if (existing.storeId !== scope.store.id || existing.createdByProfileId !== identity.userId || existing.kind !== 'CODE' || existing.creationDigest !== digest) operationConflict();
      return { ...codeInvitationView(existing, scope.store, await databaseNow(scope.tx)), ...credential(existing) };
    }
    assertStoreWritable(scope);
    const now = await databaseNow(scope.tx);
    const expiresAt = await invitationExpiration(scope.tx, scope.store.timezone, input.expiration, now);
    const tokenHash = invitationHash(invitationToken(input.operationId, scope.store.id, identity.userId));
    for (let nonce = 0; nonce < 5; nonce += 1) {
      const codeHash = invitationCodeHash(deriveInvitationCode(input.operationId, scope.store.id, identity.userId, nonce));
      const inserted = await scope.tx.invitation.createMany({ data: [{
        id: input.operationId, storeId: scope.store.id, createdByProfileId: identity.userId,
        kind: 'CODE', tokenHash, codeHash, codeNonce: nonce, creationDigest: digest,
        expiresAt, maxUses: input.maxUses,
      }], skipDuplicates: true });
      if (!inserted.count) continue;
      const invitation = await scope.tx.invitation.findUniqueOrThrow({ where: { id: input.operationId } });
      await storeAudit(scope, 'invitation.created', invitation.id);
      return { ...codeInvitationView(invitation, scope.store, now), ...credential(invitation) };
    }
    throw new AppError('invitation_generation_unavailable', 503, 'Não foi possível gerar o convite agora. Tente novamente em instantes.');
  });
}

export async function readInvitationCredential(identity: Identity, storeId: string, invitationId: string): Promise<InvitationCredential> {
  const id = resourceId(invitationId);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    const invitation = await scope.tx.invitation.findFirst({ where: { id, storeId: scope.store.id, kind: 'CODE' } });
    if (!invitation) unavailable();
    return credential(invitation);
  });
}
