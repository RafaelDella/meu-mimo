import { expect } from '@playwright/test';
import { actionsFit, ids, json, mockApi, noOverflow, store, test } from './helpers';

test('central separa papéis, busca e pagina com contexto explícito', async ({ page }) => {
  const queries: URLSearchParams[] = [];
  await mockApi(page, async (route, url) => {
    if (url.pathname !== '/api/lojas') return false;
    queries.push(url.searchParams);
    const merchant = url.searchParams.get('role') === 'MERCHANT';
    const second = url.searchParams.get('page') === '2';
    const item = store({ id: second ? ids.second : ids.first,
      name: merchant ? 'Minha loja própria' : second ? 'Outro cantinho' : 'Loja convidada',
      role: merchant ? 'MERCHANT' : 'PARTICIPANT' });
    await json(route, { items: [item], page: second ? 2 : 1, pageSize: 20, total: 21 });
    return true;
  });
  await page.goto('/lojas');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Minhas lojas');
  await expect(page.getByRole('heading', { name: 'Loja convidada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lojas que participo' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Outro cantinho' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar loja' }).fill('Cantinho');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect.poll(() => queries[queries.length - 1]?.get('q')).toBe('Cantinho');
  expect(queries[queries.length - 1]?.get('page')).toBe('1');
  await page.getByRole('button', { name: 'Lojas que criei' }).click();
  await expect(page.getByRole('heading', { name: 'Minha loja própria' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gerenciar loja', exact: true })).toBeVisible();
  await page.getByLabel('Mostrar lojas').selectOption('CLOSED');
  await expect.poll(() => queries[queries.length - 1]?.get('state')).toBe('CLOSED');
  expect(queries[queries.length - 1]?.get('role')).toBe('MERCHANT');
  await noOverflow(page);
  await actionsFit(page);
  await page.screenshot({ path: test.info().outputPath('stores-hub.png'), fullPage: true });
});

test('central mostra falha recuperável e estado vazio sem inventar saldo ou catálogo', async ({ page }) => {
  let attempts = 0;
  await mockApi(page, async (route, url) => {
    if (url.pathname !== '/api/lojas') return false;
    attempts += 1;
    await json(route, attempts === 1 ? { code: 'unavailable', message: 'Tente abrir suas lojas novamente.' } :
      { items: [], page: 1, pageSize: 20, total: 0 }, attempts === 1 ? 503 : 200);
    return true;
  });
  await page.goto('/lojas');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Tente abrir suas lojas novamente.');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Nenhuma loja por aqui ainda' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Criar lojinha', exact: true })).toBeVisible();
  await expect(page.getByText('240 pontos', { exact: true })).toHaveCount(0);
  await noOverflow(page);
});

test('criação consulta a mesma operação após resposta incerta e preserva o formulário', async ({ page }) => {
  const payloads: Record<string, unknown>[] = [];
  await mockApi(page, async (route, url, state) => {
    if (url.pathname !== '/api/lojas' || route.request().method() !== 'POST') return false;
    payloads.push(route.request().postDataJSON() as Record<string, unknown>);
    if (payloads.length === 1) {
      await json(route, { code: 'unavailable', message: 'Não foi possível confirmar a criação.' }, 503);
    } else if (payloads.length === 2) {
      await json(route, { code: 'rate_limited', message: 'Aguarde antes de consultar novamente.' }, 429);
    } else {
      state.stores = [store({ name: 'Cantinho novo', role: 'MERCHANT' })];
      await json(route, state.stores[0], 201);
    }
    return true;
  });
  await page.goto('/lojas/nova');
  await page.getByRole('textbox', { name: 'Nome da loja', exact: true }).fill('Cantinho novo');
  await page.getByRole('textbox', { name: 'Apresentação', exact: true }).fill('Texto preservado.');
  await page.getByRole('button', { name: 'Criar lojinha', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Não foi possível confirmar a criação.');
  await expect(page.getByRole('textbox', { name: 'Nome da loja', exact: true })).toHaveValue('Cantinho novo');
  await expect(page.getByRole('textbox', { name: 'Nome da loja', exact: true })).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Consultar criação', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Aguarde antes de consultar novamente.');
  await expect(page.getByRole('textbox', { name: 'Nome da loja', exact: true })).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Consultar criação', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lojas/${ids.first}$`));
  expect(payloads).toHaveLength(3);
  expect(payloads[0]).toEqual(payloads[1]);
  expect(payloads[0]).toEqual(payloads[2]);
  expect(payloads[0].operationId).toMatch(/^[\da-f-]{36}$/i);
});

test('formulário funciona por teclado, texto 200% e movimento reduzido no celular', async ({ page }) => {
  await mockApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lojas/nova');
  const name = page.getByRole('textbox', { name: 'Nome da loja', exact: true });
  await expect(name).toBeVisible();
  const original = await name.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await name.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(original * 1.99);
  await name.focus();
  await page.keyboard.type('Loja pelo teclado');
  await page.keyboard.press('Tab');
  const presentation = page.getByRole('textbox', { name: 'Apresentação', exact: true });
  await expect(presentation).toBeFocused();
  expect(await presentation.evaluate(element => {
    const style = getComputedStyle(element);
    return element.matches(':focus-visible') && (style.outlineStyle !== 'none' || style.boxShadow !== 'none');
  })).toBe(true);
  await page.keyboard.type('Criação sem computador.');
  const save = page.getByRole('button', { name: 'Criar lojinha', exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await noOverflow(page);
  await actionsFit(page);
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('store-form-200.png'), fullPage: true });
});
