import type { InvitationView, PageResult, StoreView } from './stores.ts';

export type ExpirationInput = { kind: 'AFTER_DAYS'; days: 7 } | { kind: 'NEVER' } | { kind: 'AT'; at: string };
export type CodeInvitationInput = {
  operationId: string; kind: 'CODE'; expiration: ExpirationInput; maxUses: number | null;
};
export type CodeInvitationStatus = 'PENDING' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED' | 'PAUSED' | 'CLOSED';
export type CodeInvitationView = {
  id: string; kind: 'CODE'; expiresAt: string | null; revokedAt: string | null;
  maxUses: number | null; useCount: number; status: CodeInvitationStatus;
};
export type InvitationCredential = { id: string; code: string; url: string };
export type CodeInvitationCreated = CodeInvitationView & InvitationCredential;
export type ManagedInvitation = InvitationView | CodeInvitationView;
export type CodeInvitationPreview = {
  status: CodeInvitationStatus;
  store: { id: string; name: string | null; presentation: string };
  inviter: { displayName: string | null };
};
export type ResolvedCodeInvitation = CodeInvitationPreview & {
  viewerAction: 'JOIN' | 'OPEN' | 'MANAGE' | 'HISTORY' | 'UNAVAILABLE';
};
export type StoreSearchInput = {
  q: string; role?: 'MERCHANT' | 'PARTICIPANT'; state?: 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'ALL';
  page?: number; pageSize?: number; resolveInvitation?: boolean;
};
export type StoreSearchResult = { stores: PageResult<StoreView>; invitation: ResolvedCodeInvitation | null };
export type ExpirationCandidate = { at: string; offset: string };
