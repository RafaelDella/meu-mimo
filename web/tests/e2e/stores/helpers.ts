import { expect, test as base } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import type { InvitationPreview, PersonView, StoreView } from '../../../src/contracts/stores';
import { mockRelationshipDefaults } from './relationship-defaults';

export const test = base.extend<{ storeHealth: void }>({
  storeHealth: [async ({ page }, use) => {
    const errors: string[] = [];
    const external: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) &&
          (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
           ['54321', '54322'].includes(url.port))) external.push(`${request.method()} ${url.origin}${url.pathname}`);
    });
    await use();
    expect(errors, 'As telas não devem gerar exceções no navegador.').toEqual([]);
    expect(external, 'A prova controlada de UI não deve acessar serviços externos.').toEqual([]);
  }, { auto: true }],
});

export const ids = {
  ana: '11111111-1111-4111-8111-111111111111',
  bia: '22222222-2222-4222-8222-222222222222',
  first: '33333333-3333-4333-8333-333333333333',
  second: '44444444-4444-4444-8444-444444444444',
};

export function store(overrides: Partial<StoreView> = {}): StoreView {
  return {
    id: ids.first, name: 'Loja da Ana', presentation: 'Apresentação privada da Ana',
    timezone: 'America/Sao_Paulo', state: 'ACTIVE', platformPausedAt: null, role: 'PARTICIPANT',
    membershipId: '55555555-5555-4555-8555-555555555555', membershipClosedAt: null, ...overrides,
  };
}

export async function json(route: Route, value: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(value) });
}

type MockState = {
  loggedIn: boolean; userId: string; displayName: string; stores: StoreView[];
  people: PersonView[]; preview: InvitationPreview;
};
type Handler = (route: Route, url: URL, state: MockState) => Promise<boolean>;

// Estas respostas provam a interface; identidade e persistência são testadas por HTTP real.
export async function mockApi(page: Page, handler?: Handler) {
  const state: MockState = {
    loggedIn: true, userId: ids.ana, displayName: 'Ana privada', stores: [store()], people: [],
    preview: { status: 'PENDING', store: { id: ids.first, name: 'Loja da Ana', presentation: 'Um convite carinhoso.' },
      inviter: { displayName: 'Rafa' } },
  };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (handler && await handler(route, url, state)) return;
    if (await mockRelationshipDefaults(route, url, state.stores, state.displayName)) return;
    const method = route.request().method();
    if (url.pathname === '/api/auth/session') {
      await json(route, state.loggedIn ? {
        userId: state.userId, sessionId: state.userId, assuranceLevel: 'aal1', recovery: false,
      } : { code: 'identity_missing', message: 'Entre na sua conta.' }, state.loggedIn ? 200 : 401);
    } else if (url.pathname === '/api/perfil') {
      if (method === 'PATCH') state.displayName = route.request().postDataJSON().displayName;
      await json(route, { id: state.userId, displayName: state.displayName, email: `${state.userId}@example.test` });
    } else if (url.pathname === '/api/auth/mfa') {
      await json(route, { factors: [] });
    } else if (url.pathname === '/api/admin/session') {
      await json(route, { code: 'admin_forbidden', message: 'Acesso administrativo não permitido.' }, 403);
    } else if (url.pathname === '/api/auth/logout') {
      state.loggedIn = false;
      await json(route, { message: 'Você saiu da sua conta.' });
    } else if (url.pathname === '/api/lojas' && method === 'GET') {
      const role = url.searchParams.get('role');
      const query = url.searchParams.get('q')?.toLowerCase() ?? '';
      const items = state.stores.filter(item => (!role || item.role === role) &&
        (!query || item.name?.toLowerCase().includes(query)));
      await json(route, { items, page: 1, pageSize: 20, total: items.length });
    } else if (/^\/api\/lojas\/[^/]+$/.test(url.pathname)) {
      const segments = url.pathname.split('/');
      const result = state.stores.find(item => item.id === segments[segments.length - 1]);
      await json(route, result ?? { code: 'resource_not_found', message: 'Conteúdo indisponível.' }, result ? 200 : 404);
    } else if (url.pathname.endsWith('/participacoes')) {
      await json(route, { items: state.people, page: 1, pageSize: 20, total: state.people.length });
    } else if (url.pathname.endsWith('/tickets/resumo')) {
      await json(route, { total: 0, outstanding: 0 });
    } else if (url.pathname.endsWith('/mimos') && method === 'GET') {
      await json(route, { items: [], page: 1, pageSize: 20, total: 0, categories: [] });
    } else if (url.pathname.endsWith('/pontos') && method === 'GET') {
      const storeId = url.pathname.split('/')[3];
      await json(route, { storeId, participantMembershipId: state.stores.find(item => item.id === storeId)?.membershipId,
        available: '0', pending: '0', today: { localDate: '2026-10-22', timezone: 'America/Sao_Paulo', submitted: 0, approved: 0, credited: '0', adjusted: '0' } });
    } else if (url.pathname.endsWith('/convites')) {
      await json(route, { items: [], page: 1, pageSize: 20, total: 0 });
    } else if (/^\/api\/convites\/[^/]+$/.test(url.pathname)) {
      await json(route, state.preview);
    } else {
      await json(route, { code: 'test_unhandled', message: 'Rota não prevista no cenário de interface.' }, 500);
    }
  });
  return state;
}

export async function noOverflow(page: Page) {
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth,
    document.body.scrollWidth) <= document.documentElement.clientWidth + 1)).toBe(true);
}

export async function flushView(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

export async function actionsFit(page: Page) {
  for (const action of await page.getByRole('button').all()) {
    if (!await action.isVisible()) continue;
    const bounds = await action.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
  }
}
