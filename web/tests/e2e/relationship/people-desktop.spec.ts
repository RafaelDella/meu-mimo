import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PersonView } from '../../../src/contracts/stores';
import { actionsFit, base, feedItem, home, ids, json, membershipId, mockRelationship, noOverflow, note, now, personPath, refresh, test } from './helpers';
import { mockApi, store } from '../stores/helpers';

async function mockPanels(page: Page, options: { closed?: boolean; failed?: boolean; personName?: string } = {}) {
  return mockRelationship(page, { merchant: true, handler: async (route, url, state) => {
    const recent = { id: 'event-1', kind: 'SUBMISSION_RECEIVED', occurredAt: now, path: `${home}/registros/event-1`, author: { displayName: 'Rafa' }, participant: { displayName: 'Ana' } };
    if (url.pathname === `${base}/resumo`) {
      if (options.failed) { await json(route, { code: 'temporarily_unavailable', message: 'Resumo temporariamente indisponível.' }, 503); return true; }
      await json(route, { store: state.store, counts: { pendingSubmissions: 2, outstandingTickets: 3, activeParticipants: 4 },
        checklist: [{ key: 'PRESENTATION', done: true, path: `${home}/configuracoes` }, { key: 'ACTIVITY', done: false, path: `${home}/atividades` }, { key: 'INVITATION', done: false, path: `${home}/convites` }],
        pending: [{ id: 'pending-1', name: 'Leitura para cuidar', participantName: 'Ana', status: 'CONTESTED', path: `${home}/registros/pending-1` }],
        tickets: [{ id: 'ticket-1', name: 'Café para combinar', participantName: 'Ana', status: 'WAITING_AGREEMENT', path: `${home}/tickets/ticket-1` }], recent: [recent] }); return true;
    }
    if (url.pathname === `${base}/resumo/acontecimentos`) {
      const events = Array.from({ length: 21 }, (_, index) => ({ ...recent, id: `event-${index + 1}`, path: `${home}/registros/event-${index + 1}` }));
      const currentPage = Number(url.searchParams.get('page') ?? 1);
      await json(route, { items: events.slice((currentPage - 1) * 20, currentPage * 20), page: currentPage, pageSize: 20, total: events.length }); return true;
    }
    if (url.pathname === `${base}/participacoes/${membershipId}/resumo`) {
      await json(route, { person: { id: membershipId, storeId: ids.first, profileId: ids.ana, role: 'PARTICIPANT', closedAt: options.closed ? now : null, profile: { displayName: options.personName ?? 'Ana participante' } },
        points: { storeId: ids.first, participantMembershipId: membershipId, available: state.balance, pending: '7', today: { localDate: '2026-10-22', timezone: 'America/Sao_Paulo', submitted: 2, approved: 1, credited: '15', adjusted: '0' } },
        pendingSubmissions: 2, outstandingTickets: 3, recent: [feedItem(state)], note: { current: state.note, writable: true } }); return true;
    }
    return false;
  } });
}

async function mockPeople(page: Page) {
  const people: PersonView[] = Array.from({ length: 22 }, (_, index) => ({ id: `66666666-6666-4666-8666-${String(index + 1).padStart(12, '0')}`, storeId: ids.first, profileId: ids.bia,
    role: 'PARTICIPANT', closedAt: index === 21 ? now : null, profile: { displayName: `Pessoa ${index + 1}` } }));
  const queries: URLSearchParams[] = [];
  await mockApi(page, async (route, url, state) => {
    state.stores = [store({ role: 'MERCHANT' })];
    if (!url.pathname.endsWith('/participacoes')) return false;
    queries.push(url.searchParams); const filter = url.searchParams.get('state'); const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const items = people.filter(person => (!q || person.profile.displayName!.toLowerCase().includes(q)) && (filter === 'ALL' || (filter === 'CLOSED' ? !!person.closedAt : !person.closedAt)));
    const currentPage = Number(url.searchParams.get('page') ?? 1);
    await json(route, { items: items.slice((currentPage - 1) * 20, currentPage * 20), page: currentPage, pageSize: 20, total: items.length }); return true;
  });
  return { people, queries };
}

async function capture(page: Page, name: string) {
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  await page.screenshot({ path: `.artifacts/desktop-resumo-pessoas-${name}.png`, fullPage: true });
  await page.screenshot({ path: `.artifacts/desktop-resumo-pessoas-${name}-viewport.png` });
}

test.describe('Resumo e Pessoas no desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('pendências do resumo ficam na primeira tela antes da preparação', async ({ page }, info) => {
    const { state } = await mockPanels(page); state.store.presentation = 'Um cantinho preparado para celebrar os nossos pequenos gestos. '.repeat(8);
    await page.goto(home); const pending = page.getByRole('link', { name: 'Leitura para cuidar', exact: true });
    await expect(pending).toBeVisible(); await capture(page, `resumo-${info.project.name}`);
    await expect(pending).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('link', { name: 'Café para combinar', exact: true })).toBeInViewport({ ratio: 1 });
    expect(await pending.evaluate(element => !!(element.compareDocumentPosition([...document.querySelectorAll('h3')].find(heading => heading.textContent === 'Prepare seu cantinho')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await noOverflow(page);
  });

  test('pessoas mostram situação e mantêm abertura antes do encerramento', async ({ page }, info) => {
    await mockPeople(page); await page.goto(`${home}/pessoas`);
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Pessoa 1', exact: true }) });
    const open = card.getByRole('link', { name: 'Abrir relação de Pessoa 1', exact: true });
    await expect(open).toBeVisible(); await capture(page, `lista-${info.project.name}`);
    await expect(open).toBeInViewport({ ratio: 1 }); await expect(card.getByText('Ativa', { exact: true })).toBeVisible();
    expect((await open.boundingBox())!.y).toBeLessThan((await card.getByRole('button', { name: 'Encerrar participação', exact: true }).boundingBox())!.y);
    const search = page.getByRole('searchbox', { name: 'Buscar pessoa', exact: true }); expect((await search.boundingBox())!.width).toBeGreaterThanOrEqual(240);
    const trigger = card.getByRole('button', { name: 'Encerrar participação', exact: true });
    await trigger.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused(); await noOverflow(page);
  });

  test('relação prioriza acessos e momentos antes do potinho e do bilhete', async ({ page }, info) => {
    const { state } = await mockPanels(page); state.balance = '-9007199254740993';
    await page.goto(personPath); const open = page.getByRole('link', { name: 'Ver conquistas desta pessoa', exact: true });
    await expect(open).toBeVisible(); await capture(page, `relacao-${info.project.name}`); await expect(open).toBeInViewport({ ratio: 1 });
    const moment = page.getByRole('link', { name: 'Abrir conquista', exact: true });
    expect(await moment.evaluate(element => !!(element.compareDocumentPosition(document.querySelector('[aria-label="Seu potinho de pontos"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect(page.getByRole('region', { name: 'Seu potinho de pontos', exact: true })).toContainText('-9.007.199.254.740.993'); await noOverflow(page);
  });

  test('todos os acontecimentos substituem a prévia sem repetir o mesmo evento', async ({ page }) => {
    await mockPanels(page); await page.goto(home); await page.getByRole('button', { name: 'Ver todos os acontecimentos', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Páginas da lista', exact: true })).toBeVisible();
    await expect(page.locator(`a[href="${home}/registros/event-1"]`)).toHaveCount(1);
    const title = page.getByRole('heading', { name: 'Acontecimentos recentes', exact: true }); await expect(title).toBeFocused();
    await page.getByRole('button', { name: 'Próxima', exact: true }).click();
    await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible(); await expect(title).toBeFocused();
    await expect(page.locator(`a[href="${home}/registros/event-1"]`)).toHaveCount(0);
  });

  test('filtro, busca e paginação de pessoas continuam independentes de totais da loja', async ({ page }) => {
    const { queries } = await mockPeople(page); await page.goto(`${home}/pessoas`);
    await page.getByRole('button', { name: 'Próxima', exact: true }).click(); await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Mostrar participações', exact: true }).selectOption('CLOSED');
    await expect(page.getByText('Página 1 de 1', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Pessoa 22', exact: true })).toBeVisible();
    await expect(page.getByRole('article').getByText('Encerrada', { exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar pessoa', exact: true }).fill('Nenhuma pessoa com esse nome'); await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByText('Nenhuma pessoa encontrada. Os participantes aparecem aqui depois de aceitar um convite.', { exact: true })).toBeVisible();
    const lastQuery = queries[queries.length - 1];
    expect(lastQuery?.get('state')).toBe('CLOSED'); expect(lastQuery?.get('page')).toBe('1');
  });

  test('relação encerrada mantém contexto e acessos ao histórico', async ({ page }) => {
    await mockPanels(page, { closed: true }); await page.goto(personPath);
    await expect(page.getByText('Esta participação está encerrada. Histórico e pendências continuam acessíveis.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver resgates desta pessoa', exact: true })).toHaveAttribute('href', `${home}/tickets?membershipId=${membershipId}`);
    await expect(page.getByRole('link', { name: 'Abrir conquista', exact: true })).toBeVisible();
  });

  test('falha inicial do resumo oferece recuperação sem inventar contadores', async ({ page }) => {
    const options = { failed: true }; await mockPanels(page, options); await page.goto(home);
    await expect(page.getByRole('alert').filter({ hasText: 'Resumo temporariamente indisponível.' })).toBeVisible();
    await expect(page.getByText('Participantes ativos', { exact: true })).toHaveCount(0); options.failed = false;
    await page.getByRole('button', { name: 'Consultar resumo novamente', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Leitura para cuidar', exact: true })).toBeVisible();
  });

  test('atualização da relação preserva rascunho do bilhete e foco', async ({ page }) => {
    const { state } = await mockPanels(page); await page.goto(personPath);
    const field = page.getByRole('textbox', { name: 'Texto do bilhete', exact: true });
    const draft = 'Carinho'.repeat(285) + 'abcde'; await field.fill(draft);
    state.note = note(2, 'Nova versão recebida em outro dispositivo.'); await refresh(page);
    await expect(page.getByText('Consultar bilhete atual · versão 2', { exact: true })).toBeVisible();
    await expect(field).toHaveValue(draft); await expect(field).toBeFocused();
  });
});

test('resumo e relação cabem com 200% e movimento reduzido', async ({ page }) => {
  const personName = 'Uma pessoa querida para celebrar os nossos pequenos momentos juntos. '.repeat(2).slice(0, 80);
  const { state } = await mockPanels(page, { personName }); state.store.name = 'Carinho'.repeat(11); state.balance = '-9007199254740993';
  const mobile = page.viewportSize()!;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of [home, personPath]) {
    await page.setViewportSize(mobile);
    await page.goto(path); await expect(page.getByRole('heading', { name: path === home ? 'Resumo da sua loja' : personName, exact: true })).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await noOverflow(page); await actionsFit(page);
    for (const width of [1120, 1440]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(page); await actionsFit(page); }
  }
});

test('lista de pessoas com nome extenso cabe no celular e preserva confirmação', async ({ page }) => {
  const { people } = await mockPeople(page); people[0].profile.displayName = 'Carinho'.repeat(11); await page.goto(`${home}/pessoas`);
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: people[0].profile.displayName, exact: true }) });
  await expect(card.getByRole('link')).toBeVisible(); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await noOverflow(page); await actionsFit(page);
  await card.getByRole('button', { name: 'Encerrar participação', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(card.getByRole('button', { name: 'Encerrar participação', exact: true })).toBeFocused();
});
