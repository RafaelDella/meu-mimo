import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mockRewards, ticket } from '../redemptions/helpers';
import { mockAlbums } from '../albums/helpers';
import { actionsFit, mockTickets, noOverflow, test, ticketPath, ticketsPath } from './helpers';

async function capture(page: Page, name: string) {
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  await page.screenshot({ path: `.artifacts/desktop-tickets-${name}.png`, fullPage: true });
  await page.screenshot({ path: `.artifacts/desktop-tickets-${name}-viewport.png`, fullPage: false });
}

test.describe('Meus mimos e tickets no desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('lista prioriza os vales e mantém resumo independente dos filtros', async ({ page }, info) => {
    const { state } = await mockRewards(page);
    state.tickets = [ticket(), ticket({ id: 'segundo-ticket', code: 'MIMO-5678', status: 'AGREED' })];
    await page.goto(ticketsPath);
    const open = page.getByRole('link', { name: /Abrir ticket.*MIMO-1234/ });
    await expect(open).toBeVisible();
    await capture(page, `lista-${info.project.name}`);
    await expect(open).toBeInViewport({ ratio: 1 });
    const balance = page.getByRole('region', { name: 'Seu potinho de pontos', exact: true });
    expect(await open.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('[aria-label="Seu potinho de pontos"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect(balance).toContainText('Disponíveis');
    const from = await page.getByLabel('Tickets desde a data', { exact: true }).boundingBox();
    const to = await page.getByLabel('Tickets até a data', { exact: true }).boundingBox();
    expect(Math.abs(from!.y - to!.y)).toBeLessThan(2);
    expect(from!.width).toBeGreaterThanOrEqual(180); expect(to!.width).toBeGreaterThanOrEqual(180);
    await page.getByRole('combobox', { name: 'Estado do ticket', exact: true }).selectOption('CANCELLED');
    await page.getByRole('button', { name: 'Filtrar tickets', exact: true }).click();
    await expect(page.getByText('Nenhum ticket encontrado com estes filtros.', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Mimos ainda a realizar', exact: true })).toContainText('2 mimos ainda a realizar');
    await expect(page.getByText('Total histórico: 2 tickets emitidos.', { exact: true })).toBeVisible();
    await noOverflow(page);
  });

  test('resgates do lojista conservam filtro de pessoa e acesso visível ao ticket', async ({ page }, info) => {
    const { state, auth } = await mockRewards(page, { merchant: true }); state.tickets = [ticket()];
    await page.goto(ticketsPath);
    const open = page.getByRole('link', { name: /Abrir ticket.*MIMO-1234/ });
    await expect(open).toBeVisible(); await capture(page, `lista-lojista-${info.project.name}`);
    await expect(open).toBeInViewport({ ratio: 1 });
    expect((await page.getByRole('combobox', { name: 'Pessoa dos resgates', exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(180);
    await page.getByRole('combobox', { name: 'Pessoa dos resgates', exact: true }).selectOption(auth.people[0].id);
    await page.getByRole('button', { name: 'Filtrar tickets', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('membershipId')).toBe(auth.people[0].id);
    await expect(page.getByText('Participante: Ana participante', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Seu potinho de pontos', exact: true })).toHaveCount(0);
    await noOverflow(page);
  });

  test('prévia do álbum não empurra o acesso ao próprio ticket nem ao card vizinho', async ({ page }) => {
    const { ticketState } = await mockAlbums(page, { merchant: false, published: 1 });
    ticketState.reward!.tickets.push(ticket({ id: 'segundo-ticket', code: 'MIMO-5678' }));
    await page.goto(ticketsPath);
    await expect(page.getByText('1 momento no álbum', { exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Páginas de resultados', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('img', { name: 'Prévia privada do álbum', exact: true })).toBeVisible();
    await page.evaluate(() => { window.scrollTo(0, 0); });
    for (const code of ['MIMO-1234', 'MIMO-5678']) {
      await expect(page.getByRole('link', { name: new RegExp(`Abrir ticket.*${code}`) })).toBeInViewport({ ratio: 1 });
    }
    await noOverflow(page);
  });

  test('próximos passos antecedem textos extensos da ocasião e preservam foco do diálogo', async ({ page }, info) => {
    const { state } = await mockTickets(page, { merchant: true });
    state.current.snapshot.description = 'Um momento preparado com carinho. '.repeat(30);
    state.current.snapshot.instructions = 'Converse sobre os detalhes da ocasião. '.repeat(20);
    await page.goto(ticketPath);
    const trigger = page.getByRole('button', { name: 'Registrar combinado', exact: true });
    await expect(trigger).toBeVisible();
    await capture(page, `detalhe-${info.project.name}`);
    await expect(trigger).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Marcar realização', exact: true })).toBeInViewport({ ratio: 1 });
    const description = page.getByText(state.current.snapshot.description, { exact: true });
    expect((await trigger.boundingBox())!.y).toBeLessThan((await description.boundingBox())!.y);
    const history = await page.getByRole('region', { name: 'Histórico deste ticket', exact: true }).boundingBox();
    expect(history!.x).toBeGreaterThan((await trigger.boundingBox())!.x + 250);
    await trigger.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await noOverflow(page);
  });

  test('saldo atual negativo não se confunde com custo e saldos da ocasião', async ({ page }) => {
    const { state } = await mockTickets(page); state.reward!.balance = '-9007199254740993';
    await page.goto(ticketPath);
    const summary = page.getByRole('article', { name: 'Seu vale mimo', exact: true });
    await expect(summary).toContainText('10 pontos');
    const current = page.getByRole('region', { name: 'Seu potinho de pontos', exact: true });
    await expect(current).toContainText('9.007.199.254.740.993');
    await expect(page.getByRole('button', { name: 'Pedir cancelamento', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByText('Saldo antes do resgate', { exact: true })).toBeVisible();
    await expect(page.getByText('Saldo após o resgate', { exact: true })).toBeVisible();
    await noOverflow(page);
  });

  for (const [status, label] of [['AGREED', 'Combinado'], ['CANCELLATION_REQUESTED', 'Cancelamento solicitado'], ['FULFILLED', 'Realizado'], ['CANCELLED', 'Cancelado']] as const) {
    test(`situação ${status} mantém contexto, permissões e histórico`, async ({ page }) => {
      await mockTickets(page, { merchant: true, status }); await page.goto(ticketPath);
      await expect(page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toContainText(label);
      const actions = page.getByRole('region', { name: 'Tratamento do ticket', exact: true });
      await expect(actions).toBeInViewport();
      if (status === 'CANCELLATION_REQUESTED') {
        await expect(page.getByRole('button', { name: 'Recusar pedido', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Marcar realização', exact: true })).toHaveCount(0);
      } else if (status === 'FULFILLED' || status === 'CANCELLED') {
        await expect(actions.getByRole('button')).toHaveCount(0);
        await expect(actions).toContainText('Este ticket está encerrado.');
      }
      await expect(page.getByRole('region', { name: 'Histórico deste ticket', exact: true })).toBeVisible();
      await noOverflow(page);
    });
  }

  test('texto 200% preserva largura de leitura e controles nos dois fluxos', async ({ page }) => {
    const { state, auth } = await mockTickets(page, { merchant: true });
    auth.stores[0].name = 'Carinho'.repeat(11);
    state.current.snapshot.name = 'Um carinho especial para os nossos próximos momentos juntos'.repeat(2).slice(0, 80);
    for (const path of [ticketsPath, ticketPath]) {
      await page.goto(path);
      await expect(page.getByText('Vale mimo · MIMO-1234', { exact: true })).toBeVisible();
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      for (const width of [1120, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const content = path === ticketsPath ? page.getByRole('heading', { name: 'Resgates da loja', exact: true }) : page.getByRole('article', { name: 'Seu vale mimo', exact: true });
        expect((await content.boundingBox())!.width).toBeGreaterThanOrEqual(280);
        await noOverflow(page); await actionsFit(page);
      }
    }
  });
});

for (const merchant of [false, true]) {
  test(`celular mantém lista antes do apoio, erro associado e ticket acessível: ${merchant ? 'lojista' : 'participante'}`, async ({ page }) => {
    await mockTickets(page, { merchant }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(ticketsPath);
    const open = page.getByRole('link', { name: /Abrir ticket.*MIMO-1234/ });
    await expect(open).toBeVisible();
    expect(await open.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('[aria-label="Mimos ainda a realizar"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await page.getByLabel('Tickets desde a data', { exact: true }).fill('2026-10-23');
    const end = page.getByLabel('Tickets até a data', { exact: true }); await end.fill('2026-10-01');
    await page.getByRole('button', { name: 'Filtrar tickets', exact: true }).click();
    await expect(end).toBeFocused(); await expect(end).toHaveAttribute('aria-invalid', 'true');
    await expect(end).toHaveAccessibleDescription('A data final precisa ser igual ou posterior à inicial.');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await noOverflow(page); await actionsFit(page); await open.click();
    await expect(page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toBeVisible();
    await noOverflow(page); await actionsFit(page);
  });
}
