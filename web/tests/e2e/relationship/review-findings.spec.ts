import { expect } from '@playwright/test';
import { test, mockRelationship, home, ids, noteId, json, refresh, group } from './helpers';

test('mural mantém filtros na URL e leva retorno autorizado à origem', async ({ page }) => {
  await mockRelationship(page); await page.goto(`${home}/mural`);
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('SUBMISSION'); await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('APPROVED');
  await expect(page).toHaveURL(/type=SUBMISSION.*status=APPROVED/);
  const link = page.getByRole('link', { name: 'Abrir conquista', exact: true }); const href = await link.getAttribute('href');
  const destination = new URL(href!, page.url()); const back = destination.searchParams.get('voltar'); expect(back).toBeTruthy();
  const backUrl = new URL(back!, page.url()); expect(backUrl.pathname).toBe(`${home}/mural`); expect(backUrl.searchParams.get('type')).toBe('SUBMISSION'); expect(backUrl.searchParams.get('status')).toBe('APPROVED');
});

test('coração mostra leitura da versão atual também na área secundária de tickets', async ({ page }) => {
  const { state } = await mockRelationship(page); await page.goto(`${home}/tickets`);
  const heart = page.getByLabel('Coração: abrir bilhete', { exact: true }); await expect(heart).toContainText('Bilhete não lido');
  state.read.add(noteId); await refresh(page); await expect(heart).not.toContainText('Bilhete não lido');
});

for (const location of ['central', 'conta']) test(`seletor da ${location} encontra a loja51 com busca paginada`, async ({ page }) => {
  const stores = Array.from({ length: 51 }, (_, index) => ({ id: `a1111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    name: `Loja ${String(index + 1).padStart(2, '0')}`, presentation: '', timezone: 'America/Sao_Paulo', state: 'ACTIVE', platformPausedAt: null, role: 'PARTICIPANT', membershipId: ids.ana, membershipClosedAt: null }));
  const { state } = await mockRelationship(page, { handler: async (route, url) => {
    if (url.pathname !== '/api/lojas') return false;
    const q = url.searchParams.get('q') ?? ''; const pageNumber = Number(url.searchParams.get('page') ?? '1'); const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
    const matched = stores.filter(store => store.name.toLowerCase().includes(q.toLowerCase()));
    await json(route, { items: matched.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), page: pageNumber, pageSize, total: matched.length }); return true;
  } });
  await page.goto(location === 'central' ? '/notificacoes' : '/conta');
  await page.getByLabel('Buscar loja para selecionar', { exact: true }).fill('Loja 51'); await page.getByRole('button', { name: 'Buscar lojas', exact: true }).click();
  const selector = page.getByRole('combobox', { name: location === 'central' ? 'Loja' : 'Loja das preferências', exact: true }); await selector.selectOption(stores[50].id);
  await expect(selector).toHaveValue(stores[50].id); expect(state.calls.some(call => call.startsWith('GET /api/lojas?') && call.includes('q=Loja+51'))).toBe(true);
});

test('paginação de novidades por teclado devolve foco ao título após a consulta', async ({ page }) => {
  await mockRelationship(page, { handler: async (route, url) => {
    if (url.pathname !== '/api/notificacoes/grupos') return false;
    const pageNumber = Number(url.searchParams.get('page') ?? '1'); const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
    const items = Array.from({ length: pageSize }, (_, index) => ({ ...group(), id: `99999999-9999-4999-8999-${String((pageNumber - 1) * pageSize + index + 1).padStart(12, '0')}` }));
    await json(route, { items, page: pageNumber, pageSize, total: 40, attentionUnreadCount: 40 }); return true;
  } });
  await page.goto('/notificacoes'); const next = page.getByRole('button', { name: 'Próxima', exact: true }); await next.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Novidades', exact: true })).toBeFocused();
});
