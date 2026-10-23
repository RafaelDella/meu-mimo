import { expect } from '@playwright/test';
import { illustrations } from '../../src/contracts/illustrations';
import { mockActivities, activityId, rootPath, submission, confirm } from './activities/helpers';
import { detailPath, mockRewards, ticket, ticketsPath } from './redemptions/helpers';
import { ids, noOverflow, test } from './stores/helpers';

test('galeria apresenta os 24 desenhos locais, decodificados e sem overflow a 200%', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/visual-check/icones');
  const figures = page.locator('figure');
  await expect(figures).toHaveCount(24);
  for (const option of illustrations) {
    const figure = figures.filter({ has: page.locator('figcaption', { hasText: option.label }) });
    await expect(figure).toHaveCount(1);
    const image = figure.locator('img');
    await expect(image).toHaveAttribute('src', `/assets/${option.value}.svg`);
    await expect(image).toHaveAttribute('alt', '');
    await expect(image).toHaveAttribute('aria-hidden', 'true');
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(async element => {
      await (element as HTMLImageElement).decode();
      return (element as HTMLImageElement).naturalWidth > 0;
    })).toBe(true);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await noOverflow(page);
});

test('mimo permite escolher todos os desenhos, usar teclado e salvar a escolha', async ({ page }) => {
  const { state } = await mockRewards(page, { merchant: true });
  await page.goto(`${detailPath}/editar`);
  const selector = page.getByLabel('Ilustração', { exact: true });
  await expect(selector.locator('option')).toHaveCount(24);
  for (const option of illustrations) {
    await selector.selectOption(option.value);
    await expect(page.locator('form img')).toHaveAttribute('src', `/assets/${option.value}.svg`);
  }
  await selector.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
  await expect(selector).toHaveValue('coffee'); await expect(selector).toBeFocused();
  await page.keyboard.press('End'); await expect(selector).toHaveValue('clock');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await noOverflow(page);
  await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click();
  await expect(page).toHaveURL(detailPath);
  expect(state.bodies[0].sticker).toBe('clock');
  await page.goto(`${detailPath}/editar`); await expect(selector).toHaveValue('clock');
});

test('atividade usa a mesma biblioteca e conserva a opção sem ilustração', async ({ page }) => {
  const { state } = await mockActivities(page, { merchant: true });
  await page.goto(`${rootPath}/${activityId}/editar`);
  const selector = page.getByLabel('Ilustração (opcional)', { exact: true });
  await expect(selector.locator('option')).toHaveCount(25);
  for (const option of illustrations) {
    await selector.selectOption(option.value);
    await expect(page.locator('form img')).toHaveAttribute('src', `/assets/${option.value}.svg`);
  }
  await selector.selectOption('book');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await noOverflow(page);
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page).toHaveURL(`${rootPath}/${activityId}`);
  expect(state.activityBodies[0].sticker).toBe('book');
  await page.goto(`${rootPath}/${activityId}/editar`);
  await expect(selector).toHaveValue('book');
  await selector.selectOption(''); await expect(page.locator('form img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page).toHaveURL(`${rootPath}/${activityId}`);
  expect(state.activityBodies[1].sticker).toBe('');
});

test('o vale exibe o desenho da ocasião depois de editar o mimo', async ({ page }) => {
  const { state } = await mockRewards(page, { merchant: true });
  const historical = ticket(); historical.snapshot.sticker = 'camera'; state.tickets.push(historical);
  await page.goto(`${detailPath}/editar`);
  await page.getByLabel('Ilustração', { exact: true }).selectOption('jar');
  await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click();
  await expect(page).toHaveURL(detailPath);
  await page.goto(`${ticketsPath}/${historical.id}`);
  await expect(page.getByRole('article', { name: 'Seu vale mimo' }).locator('img')).toHaveAttribute('src', '/assets/camera.svg');
});

test('conquista mantém o desenho da ocasião no card e no detalhe após editar a atividade', async ({ page }) => {
  const { state } = await mockActivities(page, { merchant: true });
  const recordId = '99999999-9999-4999-8999-999999999999';
  state.activity.sticker = 'book';
  state.drafts.set(recordId, submission(state.activity, recordId));
  confirm(state, recordId, { caption: '', evidenceAssetId: null, expectedLocalDate: '2026-10-22', expectedTimezone: 'America/Sao_Paulo' });
  state.activity.sticker = 'jar'; state.activity.version += 1;
  state.drafts.get(recordId)!.activity = structuredClone(state.activity);
  await page.goto(`${rootPath}/${activityId}`);
  const card = page.locator('article').filter({ has: page.locator(`a[href$="/registros/${recordId}"]`) });
  await expect(card.locator('img')).toHaveAttribute('src', '/assets/book.svg');
  await page.goto(`/lojas/${ids.first}/registros/${recordId}`);
  const content = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Ler algumas páginas', exact: true }) });
  await expect(content.locator('img')).toHaveAttribute('src', '/assets/book.svg');
});

for (const kind of ['mimo', 'atividade'] as const) {
  test(`seletor de ${kind} fica bloqueado enquanto o salvamento aguarda resposta`, async ({ page }) => {
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
    let received = false;
    const handler = async (route: import('@playwright/test').Route) => {
      if (route.request().method() !== 'PATCH') return false;
      received = true; await pending; return false;
    };
    if (kind === 'mimo') await mockRewards(page, { merchant: true, handler });
    else await mockActivities(page, { merchant: true, handler });
    await page.goto(kind === 'mimo' ? `${detailPath}/editar` : `${rootPath}/${activityId}/editar`);
    const selector = page.getByLabel(kind === 'mimo' ? 'Ilustração' : 'Ilustração (opcional)', { exact: true });
    await selector.selectOption('flowers');
    try {
      await page.getByRole('button', { name: kind === 'mimo' ? 'Salvar mimo' : 'Salvar atividade', exact: true }).click();
      await expect.poll(() => received).toBe(true);
      await expect(selector).toBeDisabled();
    } finally { release(); }
    await expect(page).toHaveURL(kind === 'mimo' ? detailPath : `${rootPath}/${activityId}`);
  });
}
