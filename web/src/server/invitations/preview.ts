import '../only.ts';
import type { InvitationPreview } from '../../contracts/stores.ts';
import { getDb } from '../db/client.ts';
import { invitationHash, invitationInvalid } from './token.ts';

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const invitation = await getDb().invitation.findUnique({
    where: { tokenHash: invitationHash(token) },
    select: {
      expiresAt: true, revokedAt: true, acceptedAt: true,
      store: { select: { id: true, name: true, presentation: true, state: true } },
      creator: { select: { displayName: true } },
    },
  });
  if (!invitation) invitationInvalid();
  const { store, creator } = invitation;
  const status: InvitationPreview['status'] = store.state === 'CLOSED' ? 'CLOSED'
    : store.state === 'PAUSED' ? 'PAUSED'
      : invitation.revokedAt ? 'REVOKED' : invitation.acceptedAt ? 'ACCEPTED'
        : invitation.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'PENDING';
  return {
    status, store: { id: store.id, name: store.name, presentation: store.presentation }, inviter: creator,
  };
}
