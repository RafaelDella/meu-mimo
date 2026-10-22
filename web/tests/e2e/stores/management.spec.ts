import { expect } from '@playwright/test';
import { actionsFit, flushView, ids, json, mockApi, noOverflow, store, test } from './helpers';

test('pausa exige confirmação acessível, mantém foco e aguarda resultado confirmado', async ({ page }) => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let submitted = false;
  const state = await mockApi(page, async (route, url, current) => {
    if (!url.pathname.endsWith('/estado')) return false;
    submitted = true;
    await pending;
    current.stores[0] = { ...current.stores[0], state: 'PAUSED' };
    await json(route, current.stores[0]);
    return true;
  });
  state.stores = [store({ role: 'MERCHANT' })];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/lojas/${ids.first}/configuracoes`);
  const trigger = page.getByRole('button', { name: 'Pausar loja', exact: true });
  await expect(trigger).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Pausar esta loja?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/histórico/i);
  for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(submitted).toBe(false);
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Confirmar pausa', exact: true }).click();
  await expect.poll(() => submitted).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Confirmando…', exact: true })).toBeDisabled();
  await expect(dialog).toBeVisible();
  await noOverflow(page);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  release!();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Retomar loja', exact: true })).toBeVisible();
  await expect(page.getByText(/Esta loja está pausada/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await actionsFit(page);
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('store-paused-200.png'), fullPage: true });
});

test('participante tem navegação própria e confirmação de encerramento preserva consulta', async ({ page }) => {
  const state = await mockApi(page, async (route, url, current) => {
    if (!url.pathname.endsWith('/encerrar')) return false;
    current.stores[0] = { ...current.stores[0], membershipClosedAt: '2026-10-22T15:00:00Z' };
    await json(route, {
      id: current.stores[0].membershipId, storeId: ids.first, profileId: ids.ana, role: 'PARTICIPANT',
      closedAt: current.stores[0].membershipClosedAt, profile: { displayName: 'Ana privada' },
    });
    return true;
  });
  state.stores = [store()];
  await page.goto(`/lojas/${ids.first}/pessoas`);
  await expect(page.getByRole('navigation', { name: 'Sua participação' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Configurações', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Convites', exact: true })).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Buscar pessoa' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Encerrar participação', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Encerrar esta participação?', exact: true });
  await expect(dialog).toHaveAccessibleDescription(/definitivo.*histórico/i);
  await dialog.getByRole('button', { name: 'Confirmar encerramento', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(/Sua participação foi encerrada/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Encerrar participação', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Lojinha', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await noOverflow(page);
});

test('resposta antiga de pessoas não reaparece após trocar loja e descarta o rascunho', async ({ page }) => {
  let release: (() => void) | undefined;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let finish: (() => void) | undefined;
  const delivered = new Promise<void>(resolve => { finish = resolve; });
  let peopleRequested = false;
  const state = await mockApi(page, async (route, url) => {
    if (!url.pathname.endsWith(`/${ids.first}/participacoes`)) return false;
    peopleRequested = true;
    await delayed;
    await json(route, { items: [{ id: '66666666-6666-4666-8666-666666666666', storeId: ids.first,
      profileId: ids.bia, role: 'PARTICIPANT', closedAt: null, profile: { displayName: 'Pessoa privada da loja anterior' } }],
    page: 1, pageSize: 20, total: 1 }).catch(() => {});
    finish!();
    return true;
  });
  state.stores = [store({ role: 'MERCHANT' }), store({ id: ids.second, name: 'Outro contexto', presentation: 'Outra loja.' })];
  await page.goto(`/lojas/${ids.first}/pessoas`);
  await expect.poll(() => peopleRequested).toBe(true);
  await page.getByRole('searchbox', { name: 'Buscar pessoa' }).fill('Rascunho privado');
  await page.getByRole('link', { name: 'Trocar loja', exact: true }).click();
  await page.getByRole('link', { name: 'Entrar na loja', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Outro contexto');
  release!();
  await delivered;
  await flushView(page);
  await expect(page.getByText('Pessoa privada da loja anterior', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Buscar pessoa' })).toHaveCount(0);
  await expect(page.getByText('Rascunho privado', { exact: true })).toHaveCount(0);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain('Rascunho privado');
  expect(storage).not.toContain('Pessoa privada da loja anterior');
  await noOverflow(page);
});

test('lojista encerra pessoa e recebe foco no título após a lista atualizar', async ({ page }) => {
  const state = await mockApi(page, async (route, url, current) => {
    if (!url.pathname.endsWith('/encerrar')) return false;
    const person = { ...current.people[0], closedAt: '2026-10-22T15:00:00Z' };
    current.people = [];
    await json(route, person);
    return true;
  });
  state.stores = [store({ role: 'MERCHANT' })];
  state.people = [{ id: '66666666-6666-4666-8666-666666666666', storeId: ids.first,
    profileId: ids.bia, role: 'PARTICIPANT', closedAt: null, profile: { displayName: 'Bia privada' } }];
  await page.goto(`/lojas/${ids.first}/pessoas`);
  await page.getByRole('button', { name: 'Encerrar participação', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar encerramento', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bia privada', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pessoas', exact: true })).toBeFocused();
});
