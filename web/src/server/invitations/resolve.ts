import '../only.ts';
import type { ResolvedCodeInvitation } from '../../contracts/invitations.ts';
import { normalizeInvitationCode } from '../../lib/invitation-code.ts';
import type { Identity } from '../auth/types.ts';
import { getDb } from '../db/client.ts';
import { databaseNow, withStoreTransaction } from '../stores/transaction.ts';
import { invitationCodeHash } from './code.ts';
import { consumeInvitationCodeLimit } from './limits.ts';
import { previewSelect, publicInvitationPreview } from './preview.ts';

export async function resolveCodeInvitation(identity: Identity, code: string): Promise<ResolvedCodeInvitation | null> {
  await consumeInvitationCodeLimit(identity);
  const normalized = normalizeInvitationCode(code);
  if (!normalized) return null;
  const codeHash = invitationCodeHash(normalized);
  const address = await getDb().invitation.findUnique({ where: { codeHash }, select: { id: true, storeId: true } });
  if (!address) return null;
  return withStoreTransaction(identity, address.storeId, async scope => {
    const invitation = await scope.tx.invitation.findFirst({
      where: { id: address.id, storeId: scope.store.id, codeHash, kind: 'CODE' }, select: previewSelect,
    });
    if (!invitation) return null;
    const preview = await publicInvitationPreview(scope.tx, invitation, await databaseNow(scope.tx));
    const membership = scope.membership;
    const viewerAction = membership?.accessRevokedAt ? 'UNAVAILABLE'
      : membership && (membership.closedAt || scope.store.state === 'CLOSED') ? 'HISTORY'
        : membership ? membership.role === 'MERCHANT' ? 'MANAGE' : 'OPEN'
          : preview.status === 'PENDING' ? 'JOIN' : 'UNAVAILABLE';
    // Um CODE nunca produz ACCEPTED, que pertence apenas ao contrato legado.
    if (preview.status === 'ACCEPTED') throw new Error('Modalidade de convite inconsistente.');
    return { ...preview, status: preview.status, viewerAction };
  });
}
