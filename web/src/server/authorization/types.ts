export type StoreAction = 'store:read' | 'store:manage' | 'membership:read' | 'membership:list' | 'membership:close' | 'invitation:manage';

export type AuthorizedStoreContext = Readonly<{
  storeId: string;
  actorUserId: string;
  role: 'MERCHANT' | 'PARTICIPANT';
  membershipId: string;
  storeState: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  membershipClosedAt: string | null;
  targetMembershipId?: string;
}>;

export type AdminContext = Readonly<{
  actorUserId: string;
  assuranceLevel: 'aal2';
}>;
