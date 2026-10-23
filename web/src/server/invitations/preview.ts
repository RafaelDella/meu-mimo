import '../only.ts';
import type { InvitationPreview } from '../../contracts/stores.ts';
import { getDb } from '../db/client.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { publicAuthor, visibleAuthoredFields } from '../privacy/views.ts';
import { invitationHash, invitationInvalid } from './token.ts';

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const invitation = await getDb().invitation.findUnique({
    where: { tokenHash: invitationHash(token) },
    select: {
      expiresAt: true, revokedAt: true, acceptedAt: true,
      store: { select: { id: true, name: true, presentation: true, state: true, platformPausedAt: true, createdByProfileId: true } },
      createdByProfileId: true, creator: { select: { displayName: true } },
    },
  });
  if (!invitation) invitationInvalid();
  const { store, creator } = invitation;
  const suppressions = await suppressionFor(getDb(), [store.createdByProfileId, invitation.createdByProfileId]);
  const content = visibleAuthoredFields(store, ['name', 'presentation'], store.createdByProfileId, suppressions);
  const status: InvitationPreview['status'] = store.state === 'CLOSED' ? 'CLOSED'
    : store.state === 'PAUSED' || store.platformPausedAt ? 'PAUSED'
      : invitation.revokedAt ? 'REVOKED' : invitation.acceptedAt ? 'ACCEPTED'
        : invitation.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'PENDING';
  return {
    status, store: { id: store.id, name: content.name, presentation: content.presentation },
    inviter: publicAuthor(creator, suppressions.get(invitation.createdByProfileId)),
  };
}
