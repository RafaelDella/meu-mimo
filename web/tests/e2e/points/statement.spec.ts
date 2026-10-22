import { expect } from '@playwright/test';
import { actionsFit, entry, event, eventId, mockReview, noOverflow, originPath, statementPath, test } from './helpers';
import { ids, json, store } from '../stores/helpers';

test('extrato distingue ganho estorno e recomposição com sinais e autoria', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, status: 'APPROVED' });
  state.entries = [entry('ACTIVITY_CREDIT', '15'), entry('ACTIVITY_REVERSAL', '-15', { id: 'reverse', compensatesEntryId: eventId }), entry('ACTIVITY_RESTORE', '15', { id: 'restore', compensatesEntryId: 'reverse' })];
  await page.goto(statementPath);
  await expect(page.getByText('Ganho por atividade · Rafa', { exact: true })).toBeVisible();
  await expect(page.getByText('Estorno de conquista · Rafa', { exact: true })).toBeVisible();
  await expect(page.getByText('Recomposição de pontos · Rafa', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '-15 pontos · Leitura da ocasião', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir origem do movimento/ })).toHaveCount(3);
});
test('filtros do extrato ficam na URL e são enviados à API', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false }); await page.goto(statementPath);
  await page.getByRole('combobox', { name: 'Tipo de movimento', exact: true }).selectOption('ACTIVITY_REVERSAL');
  await page.getByLabel('Movimentos desde a data', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Movimentos até a data', { exact: true }).fill('2026-10-22');
  await page.getByRole('button', { name: 'Filtrar extrato', exact: true }).click();
  await expect(page).toHaveURL(/kind=ACTIVITY_REVERSAL.*from=2026-10-01.*to=2026-10-22.*page=1/);
  await expect(page.getByRole('heading', { name: 'Extrato de pontos', exact: true })).toBeVisible();
  await expect.poll(() => state.queries[state.queries.length - 1]?.get('kind')).toBe('ACTIVITY_REVERSAL');
});
test('origem abre decisão antiga e permite voltar com filtros preservados', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, status: 'VOIDED' });
  const applied = event('VOID', { reason: 'Decisão antiga de origem.', delta: '-15', toStatus: 'VOIDED' });
  state.operations.set(eventId, { event: applied, submission: state.current, appliedVersion: 1 });
  state.entries = [entry('ACTIVITY_REVERSAL', '-15')];
  const query = '?kind=ACTIVITY_REVERSAL&from=2026-10-01&to=2026-10-22&page=1';
  await page.goto(`${statementPath}${query}`); await page.getByRole('link', { name: /Abrir origem do movimento/ }).click();
  await expect(page.getByRole('article', { name: 'Decisão de origem', exact: true })).toBeVisible();
  await expect(page.getByText('Decisão antiga de origem.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao extrato com os filtros', exact: true }).click();
  await expect(page).toHaveURL(`${statementPath}${query}`);
  await expect(page.getByRole('combobox', { name: 'Tipo de movimento', exact: true })).toHaveValue('ACTIVITY_REVERSAL');
});
test('saldo negativo é persistente e o extrato continua acessível', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, status: 'VOIDED', balance: '-10' }); state.entries = [entry('ACTIVITY_REVERSAL', '-15')];
  await page.goto(statementPath);
  await expect(page.getByText('Este saldo está negativo por ajustes registrados no extrato.', { exact: false })).toBeVisible();
  await expect(page.locator('.ui-points').getByText('-10', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir origem do movimento/ })).toBeVisible();
  await expect(page.getByText(/Conquista registrada!/)).toHaveCount(0);
});
test('saldo e lançamento acima de MAX_SAFE_INTEGER são apresentados sem arredondar', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, balance: '9007199254740993' }); state.entries = [entry('ACTIVITY_RESTORE', '9007199254740993')];
  await page.goto(statementPath);
  await expect(page.locator('.ui-points').getByText('9.007.199.254.740.993', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '+9.007.199.254.740.993 pontos · Leitura da ocasião', exact: true })).toBeVisible();
});
test('lojista vê autoria da participação sem inventar saldo agregado', async ({ page }) => {
  await mockReview(page, { status: 'APPROVED' }); await page.goto(statementPath);
  await expect(page.getByText('Movimentos de todas as pessoas desta loja.', { exact: false })).toBeVisible();
  await expect(page.getByText('Ganho por atividade · Ana · Rafa', { exact: true })).toBeVisible();
  await expect(page.locator('.ui-points')).toHaveCount(0);
});
test('lojista seleciona participação para obter saldo individual autorizado', async ({ page }) => {
  const membershipId = store().membershipId; let balanceMembership = '';
  await mockReview(page, { status: 'APPROVED', handler: async (route, url) => {
    if (url.pathname.endsWith('/participacoes')) {
      await json(route, { items: [{ id: membershipId, role: 'PARTICIPANT', profile: { displayName: 'Ana' } }], page: 1, pageSize: 20, total: 1 }); return true;
    }
    if (url.pathname.endsWith('/pontos')) balanceMembership = url.searchParams.get('membershipId') ?? '';
    return false;
  } });
  await page.goto(statementPath); await page.getByRole('combobox', { name: 'Pessoa do extrato', exact: true }).selectOption(membershipId);
  await page.getByRole('button', { name: 'Filtrar extrato', exact: true }).click();
  await expect(page.locator('.ui-points')).toBeVisible(); expect(balanceMembership).toBe(membershipId);
});
test('período invertido não substitui filtros aplicados', async ({ page }) => {
  await mockReview(page, { merchant: false }); await page.goto(statementPath);
  await page.getByLabel('Movimentos desde a data', { exact: true }).fill('2026-10-22');
  await page.getByLabel('Movimentos até a data', { exact: true }).fill('2026-10-01');
  await page.getByRole('button', { name: 'Filtrar extrato', exact: true }).click();
  await expect(page.getByText('A data final precisa ser igual ou posterior à inicial.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(statementPath);
});
test('falha de consulta do extrato oferece retry e mantém filtros', async ({ page }) => {
  let failed = false;
  await mockReview(page, { merchant: false, handler: async (route, url) => {
    if (failed || !url.pathname.endsWith('/pontos/movimentos')) return false;
    failed = true; await json(route, { code: 'temporarily_unavailable', message: 'Não foi possível consultar os movimentos.' }, 503); return true;
  } });
  await page.goto(`${statementPath}?kind=ACTIVITY_REVERSAL`); await page.getByRole('button', { name: 'Consultar extrato novamente', exact: true }).click();
  await expect(page.getByText('Nenhum movimento encontrado com estes filtros.', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Tipo de movimento', exact: true })).toHaveValue('ACTIVITY_REVERSAL');
});
test('paginação do extrato preserva filtros e responde ao voltar do navegador', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false }); state.entries = Array.from({ length: 21 }, (_, index) => entry('ACTIVITY_REVERSAL', '-15', { id: `entry-${index}` }));
  await page.goto(`${statementPath}?kind=ACTIVITY_REVERSAL&page=1`);
  await page.getByRole('button', { name: 'Próximos', exact: true }).click(); await expect(page).toHaveURL(/kind=ACTIVITY_REVERSAL&page=2/);
  await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
  await page.goBack(); await expect(page.getByText('Página 1 de 2', { exact: true })).toBeVisible();
});
test('potinho liga ao extrato e resumo distingue ganhos de ajustes', async ({ page }) => {
  await mockReview(page, { merchant: false, status: 'APPROVED' }); await page.goto(`/lojas/${ids.first}/atividades`);
  await expect(page.getByText('Ajustes líquidos', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ver extrato de pontos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Extrato de pontos', exact: true })).toBeVisible();
});
test('extrato cabe em celular com texto 200% e movimento reduzido', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, balance: '-9007199254740993' }); state.entries = [entry('ACTIVITY_REVERSAL', '-9007199254740993')];
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(statementPath);
  await noOverflow(page); await actionsFit(page); await page.screenshot({ path: `.artifacts/t08-statement-${page.viewportSize()!.width}.png`, fullPage: true });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await noOverflow(page); await actionsFit(page); await page.screenshot({ path: `.artifacts/t08-statement-200-${page.viewportSize()!.width}.png`, fullPage: true });
});
test('histórico pagina e a decisão solicitada permanece destacada fora da página atual', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, status: 'VOIDED' });
  const old = event('VOID', { reason: 'Evento antigo preservado.', delta: '-15' });
  state.events = Array.from({ length: 21 }, (_, index) => event('CONTEST', { id: `history-${index}`, reason: `Histórico ${index + 1}`, delta: '0' }));
  state.operations.set(eventId, { event: old, submission: state.current, appliedVersion: 1 });
  await page.goto(`${originPath}?evento=${eventId}`);
  await expect(page.getByRole('article', { name: 'Decisão de origem', exact: true })).toBeVisible();
  await page.getByRole('region', { name: 'Histórico deste registro', exact: true }).getByRole('button', { name: 'Próximos', exact: true }).click();
  await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Histórico deste registro', exact: true })).toBeFocused();
  await expect(page.getByText('Evento antigo preservado.', { exact: false })).toBeVisible();
});
