export type StoreState = 'ACTIVE' | 'PAUSED' | 'CLOSED';
export type StoreRole = 'MERCHANT' | 'PARTICIPANT';
export type PageResult<T> = { items: T[]; page: number; pageSize: number; total: number };
export type StoreView = {
  id: string; name: string | null; presentation: string; timezone: string;
  state: StoreState; platformPausedAt: string | null; role: StoreRole; membershipId: string; membershipClosedAt: string | null;
};
export type PersonView = {
  id: string; storeId: string; profileId: string; role: StoreRole;
  closedAt: string | null; profile: { displayName: string | null };
};
export type InvitationView = {
  id: string; expiresAt: string; revokedAt: string | null; acceptedAt: string | null;
};
export type InvitationPreview = {
  status: 'PENDING' | 'EXPIRED' | 'REVOKED' | 'ACCEPTED' | 'PAUSED' | 'CLOSED';
  store: { id: string; name: string | null; presentation: string };
  inviter: { displayName: string | null };
};
export type InvitationResult = { storeId: string; membershipId: string; role: StoreRole };
export type ProfileView = { id: string; displayName: string | null; email: string };
