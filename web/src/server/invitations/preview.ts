import '../only.ts';
import type { InvitationPreview } from '../../contracts/stores.ts';
import type { CodeInvitationPreview } from '../../contracts/invitations.ts';
import { getDb } from '../db/client.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { publicAuthor, visibleAuthoredFields } from '../privacy/views.ts';
import { invitationHash, invitationInvalid } from './token.ts';
import { codeInvitationStatus } from './policy.ts';
import { databaseNow, type StoreTransaction } from '../stores/transaction.ts';

export const previewSelect = {
  kind: true, expiresAt: true, revokedAt: true, acceptedAt: true, maxUses: true, useCount: true,
  store: { select: { id: true, name: true, presentation: true, state: true, platformPausedAt: true, createdByProfileId: true } },
  createdByProfileId: true, creator: { select: { displayName: true } },
} as const;

type PreviewRecord = {
  kind: string; expiresAt: Date | null; revokedAt: Date | null; acceptedAt: Date | null; maxUses: number | null; useCount: number;
  createdByProfileId: string; creator: { displayName: string | null };
  store: { id: string; name: string | null; presentation: string; state: string; platformPausedAt: Date | null; createdByProfileId: string };
};

export async function publicInvitationPreview(tx: StoreTransaction, invitation: PreviewRecord, now: Date): Promise<InvitationPreview | CodeInvitationPreview> {
  const { store, creator } = invitation;
  const suppressions = await suppressionFor(tx, [store.createdByProfileId, invitation.createdByProfileId]);
  const content = visibleAuthoredFields(store, ['name', 'presentation'], store.createdByProfileId, suppressions);
  const status = invitation.kind === 'CODE' ? codeInvitationStatus(invitation, store, now)
    : store.state === 'CLOSED' ? 'CLOSED'
    : store.state === 'PAUSED' || store.platformPausedAt ? 'PAUSED'
      : invitation.revokedAt ? 'REVOKED' : invitation.acceptedAt ? 'ACCEPTED'
        : !invitation.expiresAt || invitation.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'PENDING';
  return {
    status, store: { id: store.id, name: content.name, presentation: content.presentation },
    inviter: publicAuthor(creator, suppressions.get(invitation.createdByProfileId)),
  };
}

export async function previewInvitation(token: string): Promise<InvitationPreview | CodeInvitationPreview> {
  const tx = getDb();
  const invitation = await tx.invitation.findUnique({ where: { tokenHash: invitationHash(token) }, select: previewSelect });
  if (!invitation) invitationInvalid();
  return publicInvitationPreview(tx, invitation, await databaseNow(tx));
}
