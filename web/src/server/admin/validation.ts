import '../only.ts';
import type { AdminActionBody, AdminActionKind, AdminHistoryQuery, AdminListQuery, AdminTargetRef } from '../../contracts/admin.ts';
import { allowedFields, invalidField } from '../stores/validation.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = ['BLOCK_ACCOUNT', 'UNBLOCK_ACCOUNT', 'PAUSE_STORE', 'RESUME_STORE'] as const;
export type AdminPage = { page: number; pageSize: number; skip: number };
export type ParsedAdminList = AdminPage & AdminListQuery;

export function adminUuid(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) invalidField();
  return value.toLowerCase();
}

function text(value: unknown, maximum: number, required = false): string {
  if (typeof value !== 'string') invalidField();
  const result = value.trim().normalize('NFC');
  if ((required && !result) || [...result].length > maximum || /[\uD800-\uDFFF]/u.test(result) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) invalidField();
  return result;
}

export function adminPage(body: Record<string, unknown>): AdminPage {
  function integer(key: string, fallback: number, maximum: number) {
    const value = body[key] === undefined ? fallback : body[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) invalidField();
    return value;
  }
  const page = integer('page', 1, 1_000_000); const pageSize = integer('pageSize', 20, 50);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function parseAdminList(body: Record<string, unknown>, type: 'ACCOUNT' | 'STORE'): ParsedAdminList {
  allowedFields(body, ['page', 'pageSize', 'q', 'id', ...(type === 'ACCOUNT' ? ['security'] : ['state', 'platformPaused'])]);
  const result: ParsedAdminList = adminPage(body);
  if (body.q !== undefined) {
    const q = text(body.q, 80);
    if (/[\u0000-\u001f\u007f]/.test(q)) invalidField();
    result.q = q;
    if (uuid.test(q)) { result.id = adminUuid(q); result.q = ''; }
  }
  if (body.id !== undefined) {
    const id = adminUuid(body.id);
    if (result.id && result.id !== id) invalidField();
    result.id = id;
  }
  if (body.security !== undefined) {
    if (!['ACTIVE', 'BLOCKED'].includes(body.security as string)) invalidField();
    result.security = body.security as 'ACTIVE' | 'BLOCKED';
  }
  if (body.state !== undefined) {
    if (!['ACTIVE', 'PAUSED', 'CLOSED'].includes(body.state as string)) invalidField();
    result.state = body.state as 'ACTIVE' | 'PAUSED' | 'CLOSED';
  }
  if (body.platformPaused !== undefined) {
    if (typeof body.platformPaused !== 'boolean') invalidField();
    result.platformPaused = body.platformPaused;
  }
  return result;
}

export function parseAdminTarget(value: unknown): AdminTargetRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidField();
  const target = value as Record<string, unknown>;
  allowedFields(target, ['type', 'id']);
  if (target.type !== 'ACCOUNT' && target.type !== 'STORE') invalidField();
  return { type: target.type, id: adminUuid(target.id) };
}

function compatible(action: unknown, target: AdminTargetRef): AdminActionKind {
  if (typeof action !== 'string' || !actions.includes(action as AdminActionKind) ||
      (target.type === 'ACCOUNT') !== ['BLOCK_ACCOUNT', 'UNBLOCK_ACCOUNT'].includes(action)) invalidField();
  return action as AdminActionKind;
}

export function parseAdminAction(body: Record<string, unknown>): AdminActionBody {
  allowedFields(body, ['operationId', 'target', 'action', 'expectedVersion', 'reason']);
  const target = parseAdminTarget(body.target); const version = body.expectedVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0 || version > 2_147_483_646) invalidField();
  return { operationId: adminUuid(body.operationId), target, action: compatible(body.action, target),
    expectedVersion: version, reason: text(body.reason, 500, true) };
}

export function parseAdminHistory(body: Record<string, unknown>): AdminHistoryQuery & AdminPage {
  allowedFields(body, ['target', 'action', 'page', 'pageSize']);
  const target = parseAdminTarget(body.target);
  return { target, ...adminPage(body), ...(body.action === undefined ? {} : { action: compatible(body.action, target) }) };
}
