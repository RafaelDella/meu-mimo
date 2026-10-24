import '../only.ts';
import type { CodeInvitationStatus, CodeInvitationView } from '../../contracts/invitations.ts';
import { AppError } from '../errors.ts';

type Policy = { id?: string; expiresAt: Date | null; revokedAt: Date | null; maxUses: number | null; useCount: number };
type Availability = { state: string; platformPausedAt: Date | null };

export function codeInvitationStatus(invitation: Policy, store: Availability, now: Date): CodeInvitationStatus {
  if (store.state === 'CLOSED') return 'CLOSED';
  if (store.state === 'PAUSED' || store.platformPausedAt) return 'PAUSED';
  if (invitation.revokedAt) return 'REVOKED';
  if (invitation.expiresAt && invitation.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (invitation.maxUses !== null && invitation.useCount >= invitation.maxUses) return 'EXHAUSTED';
  return 'PENDING';
}

export function codeInvitationView(invitation: Policy & { id: string }, store: Availability, now: Date): CodeInvitationView {
  return { id: invitation.id, kind: 'CODE', expiresAt: invitation.expiresAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null, maxUses: invitation.maxUses,
    useCount: invitation.useCount, status: codeInvitationStatus(invitation, store, now) };
}

export function assertCodePending(invitation: Policy, store: Availability, now: Date): void {
  const status = codeInvitationStatus(invitation, store, now);
  if (status === 'REVOKED') throw new AppError('invitation_revoked', 409, 'Este convite foi revogado. Peça um novo convite a quem convidou.');
  if (status === 'EXPIRED') throw new AppError('invitation_expired', 409, 'Este convite expirou. Peça um novo convite a quem convidou.');
  if (status === 'EXHAUSTED') throw new AppError('invitation_exhausted', 409, 'Este convite atingiu o limite de participantes. Peça um novo convite a quem convidou.');
}
