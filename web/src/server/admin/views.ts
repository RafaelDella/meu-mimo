import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { AdminAccountView, AdminActionView, AdminCounts, AdminStoreDetail, AdminStoreView } from '../../contracts/admin.ts';
import type { Suppressions } from '../privacy/suppression.ts';
import { publicAuthor, visibleAuthoredFields, visibleAuthoredText } from '../privacy/views.ts';

export const accountSelect = {
  id: true, displayName: true, createdAt: true, suspendedAt: true, securityVersion: true,
  adminGrant: { select: { revokedAt: true } }, _count: { select: { authoredStores: true } },
} satisfies Prisma.ProfileSelect;
export type AccountRow = Prisma.ProfileGetPayload<{ select: typeof accountSelect }>;
export const storeSelect = {
  id: true, name: true, createdAt: true, state: true, platformPausedAt: true, platformVersion: true,
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.StoreSelect;
export type StoreRow = Prisma.StoreGetPayload<{ select: typeof storeSelect }>;
export const actionSelect = {
  id: true, targetProfileId: true, targetStoreId: true, kind: true, version: true, reason: true,
  previousRestrictedAt: true, restrictedAt: true, createdAt: true,
  actor: { select: { id: true, displayName: true } },
} satisfies Prisma.AdminActionSelect;
export type ActionRow = Prisma.AdminActionGetPayload<{ select: typeof actionSelect }>;
export const noParticipants = (): AdminCounts => ({ open: 0, closed: 0, revoked: 0 });

export function accountView(row: AccountRow, participations: AdminCounts, actorId: string, suppressions: Suppressions): AdminAccountView {
  return { id: row.id, displayName: publicAuthor(row, suppressions.get(row.id)).displayName, createdAt: row.createdAt.toISOString(),
    suspendedAt: row.suspendedAt?.toISOString() ?? null, version: row.securityVersion,
    createdStores: row._count.authoredStores, participations,
    canBlock: !suppressions.get(row.id)?.identity && row.id !== actorId && (!row.adminGrant || row.adminGrant.revokedAt !== null) };
}

export function adminStoreView(row: StoreRow, participants: AdminCounts, suppressions: Suppressions): AdminStoreView {
  return { id: row.id, name: visibleAuthoredFields(row, ['name'], row.createdBy.id, suppressions).name,
    createdAt: row.createdAt.toISOString(), owner: publicAuthor(row.createdBy, suppressions.get(row.createdBy.id)),
    state: row.state, platformPausedAt: row.platformPausedAt?.toISOString() ?? null,
    version: row.platformVersion, participants };
}

export function adminStoreDetail(row: StoreRow & { timezone: string }, participants: AdminCounts, suppressions: Suppressions): AdminStoreDetail {
  return { ...adminStoreView(row, participants, suppressions), timezone: row.timezone };
}

export function adminActionView(row: ActionRow, suppressions: Suppressions): AdminActionView {
  const target = row.targetProfileId ? { type: 'ACCOUNT' as const, id: row.targetProfileId } :
    { type: 'STORE' as const, id: row.targetStoreId! };
  return { id: row.id, target, action: row.kind as AdminActionView['action'], actor: publicAuthor(row.actor, suppressions.get(row.actor.id)),
    reason: visibleAuthoredText(row.reason, row.actor.id, suppressions), createdAt: row.createdAt.toISOString(), version: row.version,
    previousRestrictedAt: row.previousRestrictedAt?.toISOString() ?? null,
    restrictedAt: row.restrictedAt?.toISOString() ?? null };
}
