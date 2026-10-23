import '../only.ts';
import type { Invitation, Membership, Store } from '../../generated/prisma/client.ts';
import type { InvitationView, PersonView, StoreView } from '../../contracts/stores.ts';

export function storeView(store: Store, membership: Membership): StoreView {
  return {
    id: store.id, name: store.name, presentation: store.presentation, timezone: store.timezone,
    state: store.state, role: membership.role, membershipId: membership.id,
    membershipClosedAt: membership.closedAt?.toISOString() ?? null,
    platformPausedAt: store.platformPausedAt?.toISOString() ?? null,
  };
}

export const personSelect = {
  id: true, storeId: true, profileId: true, role: true, closedAt: true,
  profile: { select: { displayName: true } },
} as const;

export function personView(person: Omit<PersonView, 'closedAt'> & { closedAt: Date | null }): PersonView {
  return { ...person, closedAt: person.closedAt?.toISOString() ?? null };
}

export function invitationView(invitation: Invitation): InvitationView {
  return {
    id: invitation.id, expiresAt: invitation.expiresAt.toISOString(),
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
  };
}
