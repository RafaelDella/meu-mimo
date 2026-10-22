import { expect } from '@playwright/test';
import { actionsFit, detailPath, issue, mockRewards, noOverflow, test, ticket, ticketId, ticketsPath } from './helpers';
import { ids, json } from '../stores/helpers';

test('confirmação mostra loja custo saldo e emite um ticket mesmo com toque repetido', async ({ page }) => {
  let operationInUrl = '';
  const { state } = await mockRewards(page, { handler: async (route, url) => {
    if (!url.pathname.endsWith('/resgatar')) return false;
    operationInUrl = new URL(page.url()).searchParams.get('operacao') ?? ''; return false;
  } }); await page.goto(detailPath);
  await page.getByRole('button', { name: 'Resgatar mimo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar resgate', exact: true });
  await expect(dialog.getByText('Loja: Loja da Ana', { exact: true })).toBeVisible();
  await expect(dialog.getByText('5 pontos', { exact: true })).toBeVisible();
  const confirmation = dialog.getByRole('button', { name: 'Confirmar e resgatar', exact: true });
  await confirmation.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect(page).toHaveURL(new RegExp(`${ticketsPath}/[0-9a-f-]+$`));
  await expect(page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toBeVisible();
  expect(state.bodies).toHaveLength(1); expect(state.bodies[0].operationId).toBe(operationInUrl); expect(state.balance).toBe('5');
  await expect(page.getByRole('navigation', { name: 'Sua participação', exact: true }).getByRole('link', { name: 'Meus mimos', exact: true }))
    .toHaveAccessibleDescription('1 mimo ainda a realizar.');
  await expect(page.getByRole('button', { name: /Realizar|Cancelar|Álbum/ })).toHaveCount(0);
});

test('diálogo segura Tab e Shift Tab e Escape devolve foco', async ({ page }) => {
  await mockRewards(page); await page.goto(detailPath); const trigger = page.getByRole('button', { name: 'Resgatar mimo', exact: true });
  await trigger.click(); const dialog = page.getByRole('dialog', { name: 'Confirmar resgate', exact: true });
  const close = dialog.getByRole('button', { name: 'Fechar', exact: true }); const confirm = dialog.getByRole('button', { name: 'Confirmar e resgatar', exact: true });
  await close.focus(); await page.keyboard.press('Shift+Tab'); await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused(); await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
});

test('resposta perdida após emissão é recuperada no reload sem novo POST', async ({ page }) => {
  let first = true;
  const { state } = await mockRewards(page, { handler: async (route, url, current) => {
    if (!first || !url.pathname.endsWith('/resgatar')) return false;
    first = false; const body = route.request().postDataJSON(); current.bodies.push(body); issue(current, body); await route.abort('failed'); return true;
  } }); await page.goto(detailPath); await page.getByRole('button', { name: 'Resgatar mimo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar e resgatar', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Consultar resultado do resgate', exact: true })).toBeVisible();
  const operationId = new URL(page.url()).searchParams.get('operacao'); expect(operationId).toBeTruthy();
  await page.reload(); await expect(page).toHaveURL(`${ticketsPath}/${operationId}`);
  await expect(page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toBeVisible(); expect(state.bodies).toHaveLength(1); expect(state.tickets).toHaveLength(1);
});

test('reload de intenção não confirmada consulta antes e exige nova revisão com mesma UUID', async ({ page }) => {
  let first = true;
  const { state } = await mockRewards(page, { handler: async (route, url, current) => {
    if (!first || !url.pathname.endsWith('/resgatar')) return false;
    first = false; current.bodies.push(route.request().postDataJSON()); await route.abort('failed'); return true;
  } }); await page.goto(detailPath); await page.getByRole('button', { name: 'Resgatar mimo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar e resgatar', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Consultar resultado do resgate', exact: true })).toBeVisible();
  const operationId = new URL(page.url()).searchParams.get('operacao'); state.balance = '14'; state.calls = [];
  await page.reload(); await page.getByRole('button', { name: 'Carregar nova prévia', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('4 pontos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar e resgatar', exact: true }).click(); await expect(page).toHaveURL(`${ticketsPath}/${operationId}`);
  expect(state.bodies.map(body => body.operationId)).toEqual([operationId, operationId]); expect(state.bodies[1].expectedBalance).toBe('14');
  const lookup = state.calls.findIndex(call => call.includes('/operacoes/')); const preview = state.calls.findIndex(call => call.endsWith('/mimos/d1111111-1111-4111-8111-111111111111'));
  expect(lookup).toBeGreaterThanOrEqual(0); expect(preview).toBeGreaterThan(lookup);
});

test('conflito de saldo consulta operação e exige revisão explícita antes da mesma intenção', async ({ page }) => {
  let first = true;
  const { state } = await mockRewards(page, { handler: async (route, url, current) => {
    if (!first || !url.pathname.endsWith('/resgatar')) return false;
    first = false; current.bodies.push(route.request().postDataJSON()); current.balance = '12';
    await json(route, { code: 'balance_changed', message: 'Seu saldo mudou. Revise os valores.' }, 409); return true;
  } }); await page.goto(detailPath); await page.getByRole('button', { name: 'Resgatar mimo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar e resgatar', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); await page.getByRole('button', { name: 'Carregar nova prévia', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('2 pontos', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Confirmar e resgatar', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toBeVisible();
  expect(state.bodies[0].operationId).toBe(state.bodies[1].operationId); expect(state.bodies[1].expectedBalance).toBe('12');
});

test('503 e 429 consultam resultado sem repetir a emissão incerta', async ({ page }) => {
  let lookups = 0;
  const { state } = await mockRewards(page, { handler: async (route, url, current) => {
    if (url.pathname.endsWith('/resgatar')) {
      const body = route.request().postDataJSON(); current.bodies.push(body); issue(current, body);
      await json(route, { code: 'temporarily_unavailable', message: 'O resultado ainda não foi confirmado.' }, 503); return true;
    }
    if (!url.pathname.includes('/operacoes/')) return false;
    lookups += 1; if (lookups > 2) return false;
    await json(route, { code: lookups === 1 ? 'temporarily_unavailable' : 'rate_limited', message: 'Consulte o resultado novamente em instantes.' }, lookups === 1 ? 503 : 429); return true;
  } }); await page.goto(detailPath); await page.getByRole('button', { name: 'Resgatar mimo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar e resgatar', exact: true }).click();
  for (let index = 0; index < 3; index += 1) {
    const consult = page.getByRole('dialog').getByRole('button', { name: 'Consultar resultado do resgate', exact: true });
    await expect(consult).toBeEnabled(); await consult.click();
    if (index < 2) await expect.poll(() => lookups).toBe(index + 1);
  }
  await expect(page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toBeVisible(); expect(state.bodies).toHaveLength(1); expect(state.tickets).toHaveLength(1);
});

test('ticket preserva snapshot e extrato abre sua origem com retorno filtrado', async ({ page }) => {
  const { state } = await mockRewards(page); state.tickets = [ticket()]; state.current.name = 'Nome novo do catálogo';
  await page.goto(`/lojas/${ids.first}/extrato?kind=REDEMPTION_DEBIT&page=1`);
  await expect(page.getByRole('heading', { name: '-10 pontos · Café da ocasião', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Abrir origem do movimento/ }).click(); await expect(page).toHaveURL(new RegExp(`${ticketsPath}/${ticketId}`));
  await expect(page.getByRole('heading', { name: 'Café da ocasião', exact: true })).toBeVisible();
  await expect(page.getByText('Um recadinho só nosso.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conversa deste item', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao extrato com os filtros', exact: true }).click();
  await expect(page).toHaveURL(`/lojas/${ids.first}/extrato?kind=REDEMPTION_DEBIT&page=1`);
});

test('ticket e confirmação cabem com texto 200% e movimento reduzido', async ({ page }) => {
  const { state } = await mockRewards(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(detailPath);
  await page.getByRole('button', { name: 'Resgatar mimo', exact: true }).click(); await noOverflow(page); await actionsFit(page);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' }); await noOverflow(page); await actionsFit(page);
  await page.screenshot({ path: `.artifacts/t09-confirm-200-${page.viewportSize()!.width}.png`, fullPage: true });
  await page.keyboard.press('Escape'); state.tickets = [ticket()]; await page.goto(`${ticketsPath}/${ticketId}`);
  await noOverflow(page); await actionsFit(page); await page.addStyleTag({ content: 'html { font-size: 200%; }' }); await noOverflow(page); await actionsFit(page);
  await page.screenshot({ path: `.artifacts/t09-ticket-200-${page.viewportSize()!.width}.png`, fullPage: true });
});
