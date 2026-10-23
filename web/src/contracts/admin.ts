import type { PageResult, StoreRole, StoreState } from './stores';

export type AdminTargetKind = 'ACCOUNT' | 'STORE';
export type AdminActionKind = 'BLOCK_ACCOUNT' | 'UNBLOCK_ACCOUNT' | 'PAUSE_STORE' | 'RESUME_STORE';
export type AdminTargetRef = { type: AdminTargetKind; id: string };
export type AdminCounts = { open: number; closed: number; revoked: number };
export type AdminAccountView = {
  id: string; displayName: string | null; createdAt: string; suspendedAt: string | null;
  version: number; createdStores: number; participations: AdminCounts; canBlock: boolean;
};
export type AdminStoreView = {
  id: string; name: string | null; createdAt: string; owner: { id: string; displayName: string | null };
  state: StoreState; platformPausedAt: string | null; version: number; participants: AdminCounts;
};
export type AdminStoreDetail = AdminStoreView & { timezone: string };
export type AdminRelationView = {
  id: string; storeId: string; storeName: string | null; role: StoreRole;
  closedAt: string | null; accessRevokedAt: string | null;
};
export type AdminActionBody = {
  operationId: string; target: AdminTargetRef; action: AdminActionKind; expectedVersion: number; reason: string;
};
export type AdminActionView = {
  id: string; target: AdminTargetRef; action: AdminActionKind; actor: { id: string; displayName: string | null };
  reason: string; createdAt: string; version: number; previousRestrictedAt: string | null; restrictedAt: string | null;
};
export type AdminActionResult = {
  operation: AdminActionView; current: AdminAccountView | AdminStoreDetail; appliedVersion: number;
};
export type AdminActionLookup = { operation: AdminActionResult | null };
export type AdminOverview = {
  accounts: { active: number; blocked: number };
  stores: { active: number; paused: number; closed: number; platformPaused: number };
  recent: { accountsCreated: number; storesCreated: number; actions: number };
  window: { from: string; to: string; timezone: 'UTC' };
};
export type AdminListQuery = {
  page?: number; pageSize?: number; q?: string; id?: string; security?: 'ACTIVE' | 'BLOCKED';
  state?: StoreState; platformPaused?: boolean;
};
export type AdminHistoryQuery = { target: AdminTargetRef; page?: number; pageSize?: number; action?: AdminActionKind };
export type AdminPage<T> = PageResult<T>;
