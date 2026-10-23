import type { Page, Route } from '@playwright/test';
import type { AdminAccountView, AdminActionBody, AdminActionResult, AdminActionView, AdminListQuery, AdminOverview, AdminStoreDetail, AdminTargetRef } from '../../../src/contracts/admin';
import { ids, json, mockApi } from '../stores/helpers';

export { ids, json, test, noOverflow, actionsFit } from '../stores/helpers';
export const now = '2026-10-23T12:00:00.000Z';
export const accountId = ids.bia;
export const storeId = ids.first;
export const accountPath = `/admin/contas/${accountId}`;
export const storePath = `/admin/lojas/${storeId}`;
export function account(overrides: Partial<AdminAccountView> = {}): AdminAccountView {
  return { id: accountId, displayName: 'Pessoa de metadados', createdAt: now, suspendedAt: null, version: 0, createdStores: 1,
    participations: { open: 2, closed: 1, revoked: 1 }, canBlock: true, ...overrides };
}
export function adminStore(overrides: Partial<AdminStoreDetail> = {}): AdminStoreDetail {
  return { id: storeId, name: 'Loja de metadados', createdAt: now, owner: { id: accountId, displayName: 'Responsável de metadados' },
    state: 'ACTIVE', platformPausedAt: null, version: 0, participants: { open: 2, closed: 1, revoked: 1 }, timezone: 'America/Sao_Paulo', ...overrides };
}
export type AdminMock = {
  aal: 'aal1' | 'aal2'; grant: boolean; accounts: AdminAccountView[]; stores: AdminStoreDetail[];
  history: AdminActionView[]; operations: Map<string, AdminActionResult>; bodies: AdminActionBody[];
  queries: { path: string; body: Record<string, unknown> }[]; calls: string[];
};
type Handler = (route: Route, url: URL, state: AdminMock) => Promise<boolean>;
export function currentTarget(state: AdminMock, target: AdminTargetRef) {
  return target.type === 'ACCOUNT' ? state.accounts.find(item => item.id === target.id)! : state.stores.find(item => item.id === target.id)!;
}
export function applyAdminAction(state: AdminMock, body: AdminActionBody): AdminActionResult {
  const old = state.operations.get(body.operationId); if (old) return { ...old, current: currentTarget(state, body.target) };
  const current = currentTarget(state, body.target); const previousRestrictedAt = 'suspendedAt' in current ? current.suspendedAt : current.platformPausedAt;
  const restrictedAt = body.action === 'BLOCK_ACCOUNT' || body.action === 'PAUSE_STORE' ? now : null;
  current.version += 1; if ('suspendedAt' in current) current.suspendedAt = restrictedAt; else current.platformPausedAt = restrictedAt;
  const operation: AdminActionView = { id: body.operationId, target: body.target, action: body.action, actor: { id: ids.ana, displayName: 'Operador autorizado' },
    reason: body.reason, createdAt: now, version: current.version, previousRestrictedAt, restrictedAt };
  state.history.unshift(operation); const result = { operation, current, appliedVersion: operation.version }; state.operations.set(body.operationId, result); return result;
}
export async function mockAdmin(page: Page, options: { grant?: boolean; aal?: 'aal1' | 'aal2'; handler?: Handler } = {}) {
  // Provas controladas da interface; Auth, grants, SQL e atomicidade usam HTTP real separado.
  const state: AdminMock = { aal: options.aal ?? 'aal2', grant: options.grant ?? true, accounts: [account()], stores: [adminStore()], history: [], operations: new Map(), bodies: [], queries: [], calls: [] };
  const auth = await mockApi(page, async (route, url, identity) => {
    state.calls.push(`${route.request().method()} ${url.pathname}${url.search}`);
    if (options.handler && await options.handler(route, url, state)) return true;
    if (url.pathname === '/api/auth/session') {
      await json(route, identity.loggedIn ? { userId: identity.userId, sessionId: identity.userId, assuranceLevel: state.aal, recovery: false } : { code: 'identity_missing', message: 'Entre na sua conta.' }, identity.loggedIn ? 200 : 401); return true;
    }
    if (!url.pathname.startsWith('/api/admin/')) return false;
    if (!identity.loggedIn) { await json(route, { code: 'identity_missing', message: 'Entre na sua conta.' }, 401); return true; }
    if (!state.grant) { await json(route, { code: 'admin_forbidden', message: 'Acesso administrativo não permitido.' }, 403); return true; }
    if (state.aal !== 'aal2') { await json(route, { code: 'mfa_required', message: 'Confirme o segundo fator para acessar a administração.' }, 403); return true; }
    const path = url.pathname;
    if (path === '/api/admin/session') { await json(route, { actorUserId: identity.userId, assuranceLevel: 'aal2' }); return true; }
    if (path === '/api/admin/resumo') {
      const value: AdminOverview = { accounts: { active: 7, blocked: 2 }, stores: { active: 4, paused: 2, closed: 1, platformPaused: 3 },
        recent: { accountsCreated: 3, storesCreated: 2, actions: state.history.length }, window: { from: '2026-10-16T12:00:00.000Z', to: now, timezone: 'UTC' } };
      await json(route, value); return true;
    }
    if (path === '/api/admin/acoes') {
      const body = route.request().postDataJSON() as AdminActionBody; state.bodies.push(body); const current = currentTarget(state, body.target);
      if (!state.operations.has(body.operationId) && body.expectedVersion !== current.version) { await json(route, { code: 'admin_conflict', message: 'O alvo mudou. Revise o estado atual.' }, 409); return true; }
      await json(route, applyAdminAction(state, body)); return true;
    }
    if (path.startsWith('/api/admin/operacoes/')) { const result = state.operations.get(path.split('/').pop()!); await json(route, { operation: result ? { ...result, current: currentTarget(state, result.operation.target) } : null }); return true; }
    if (path.endsWith('/consulta')) {
      const body = route.request().postDataJSON() as AdminListQuery & { target?: AdminTargetRef }; state.queries.push({ path, body: body as Record<string, unknown> });
      const pageNumber = body.page ?? 1; const pageSize = body.pageSize ?? 20;
      let values: unknown[] = path === '/api/admin/contas/consulta' ? state.accounts.filter(item => (!body.q || item.displayName?.includes(body.q)) && (!body.security || (body.security === 'BLOCKED') === !!item.suspendedAt)) :
        path === '/api/admin/lojas/consulta' ? state.stores.filter(item => (!body.q || item.name?.includes(body.q)) && (!body.state || item.state === body.state) && (body.platformPaused === undefined || !!item.platformPausedAt === body.platformPaused)) :
          path === '/api/admin/historico/consulta' ? state.history.filter(item => !!body.target && item.target.type === body.target.type && item.target.id === body.target.id) : [];
      if (body.id) values = values.filter(item => (item as { id: string }).id === body.id);
      await json(route, { items: values.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), page: pageNumber, pageSize, total: values.length }); return true;
    }
    const current = path.startsWith('/api/admin/contas/') ? state.accounts.find(item => item.id === path.split('/').pop()) : state.stores.find(item => item.id === path.split('/').pop());
    await json(route, current ?? { code: 'resource_not_found', message: 'Metadados indisponíveis.' }, current ? 200 : 404); return true;
  });
  return { state, auth };
}
