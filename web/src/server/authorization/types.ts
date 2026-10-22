export type StoreAction = 'store:read' | 'membership:read' | 'membership:list';

export type AuthorizedStoreContext = Readonly<{
  storeId: string;
  actorUserId: string;
  role: 'MERCHANT' | 'PARTICIPANT';
  targetMembershipId?: string;
}>;

export type AdminContext = Readonly<{
  actorUserId: string;
  assuranceLevel: 'aal2';
}>;
