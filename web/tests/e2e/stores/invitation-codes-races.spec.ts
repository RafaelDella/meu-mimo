import { expect } from '@playwright/test';
import { flushView, ids, json, mockApi, store, test } from './helpers';

const code = '7KQ9M4TX2P';
const invitation = { status: 'PENDING', store: { id: ids.second, name: 'Lojinha privada', presentation: 'Só para esta conta.' },
  inviter: { displayName: 'Rafa' }, viewerAction: 'JOIN' };
const empty = { items: [], page: 1, pageSize: 20, total: 0 };

test('resposta de busca anterior não reabre um convite após outra busca', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await mockApi(page, async (route, url) => {
    if (url.pathname !== '/api/lojas/buscar') return false;
    const body = route.request().postDataJSON();
    if (body.q === code) {
      requested = true; await pending;
      await json(route, { stores: empty, invitation }).catch(() => {});
    } else await json(route, { stores: { ...empty, items: [store({ name: 'Busca atual' })], total: 1 }, invitation: null });
    return true;
  });
  await page.goto('/lojas');
  const field = page.getByRole('searchbox', { name: 'Buscar loja ou código' });
  await field.fill(code); await field.press('Enter');
  await expect.poll(() => requested).toBe(true);
  await field.fill('Busca atual'); await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Busca atual', exact: true })).toBeVisible();
  release(); await flushView(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).not.toContain(code);
});

test('troca de conta fecha a confirmação e descarta dados e resposta pendente', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let checking = false;
  let sessionRequested = false;
  const state = await mockApi(page, async (route, url, current) => {
    if (url.pathname === '/api/auth/session' && checking) {
      sessionRequested = true; await pending;
      await json(route, { userId: current.userId, sessionId: current.userId, assuranceLevel: 'aal1', recovery: false }); return true;
    }
    if (url.pathname !== '/api/lojas/buscar') return false;
    const body = route.request().postDataJSON();
    await json(route, { stores: empty, invitation: body.resolveInvitation ? invitation : null }); return true;
  });
  await page.goto('/lojas');
  const field = page.getByRole('searchbox', { name: 'Buscar loja ou código' });
  await field.fill(code); await field.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  checking = true; state.userId = ids.bia; state.displayName = 'Bia privada';
  await page.evaluate(() => window.dispatchEvent(new Event('meumimo:session-changed')));
  await expect.poll(() => sessionRequested).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Só para esta conta.', { exact: true })).toHaveCount(0);
  release();
  await expect(field).toHaveValue('');
  await expect(page.getByText('Ana privada', { exact: true })).toHaveCount(0);
});

test('aceite perdido consulta participação e navega sem repetir o consumo', async ({ page }) => {
  let accepts = 0;
  const state = await mockApi(page, async (route, url, current) => {
    if (url.pathname === '/api/lojas/buscar') {
      await json(route, { stores: empty, invitation: route.request().postDataJSON().resolveInvitation ? invitation : null }); return true;
    }
    if (url.pathname !== '/api/convites/aceitar-codigo') return false;
    accepts += 1; current.stores = [store({ id: ids.second, name: 'Lojinha privada' })];
    await route.abort('failed'); return true;
  });
  state.stores = [];
  await page.goto('/lojas');
  const field = page.getByRole('searchbox', { name: 'Buscar loja ou código' });
  await field.fill(code); await field.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: 'Participar da lojinha', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lojas/${ids.second}$`));
  expect(accepts).toBe(1);
});

test('consulta incerta permite somente conferir participação antes de outro aceite', async ({ page }) => {
  let accepts = 0;
  let checks = 0;
  await mockApi(page, async (route, url) => {
    if (url.pathname === '/api/lojas/buscar') {
      await json(route, { stores: empty, invitation: route.request().postDataJSON().resolveInvitation ? invitation : null }); return true;
    }
    if (url.pathname === '/api/convites/aceitar-codigo') {
      accepts += 1; await json(route, { code: 'unavailable', message: 'O resultado ainda não foi confirmado.' }, 503); return true;
    }
    if (url.pathname === `/api/lojas/${ids.second}`) {
      checks += 1;
      await json(route, checks === 1 ? { code: 'unavailable', message: 'Consulta indisponível.' } :
        { code: 'resource_not_found', message: 'Participação não encontrada.' }, checks === 1 ? 503 : 404); return true;
    }
    return false;
  });
  await page.goto('/lojas');
  const field = page.getByRole('searchbox', { name: 'Buscar loja ou código' });
  await field.fill(code); await field.press('Enter');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Participar da lojinha', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Conferir participação', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Participar da lojinha', exact: true })).toHaveCount(0);
  expect(accepts).toBe(1);
  await dialog.getByRole('button', { name: 'Conferir participação', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Participar da lojinha', exact: true })).toBeEnabled();
  expect(accepts).toBe(1); expect(checks).toBe(2);
});

test('perder sessão descarta aceite pendente e não navega por resposta tardia', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let finish!: () => void;
  const delivered = new Promise<void>(resolve => { finish = resolve; });
  let accepting = false;
  const state = await mockApi(page, async (route, url) => {
    if (url.pathname === '/api/lojas/buscar') {
      await json(route, { stores: empty, invitation: route.request().postDataJSON().resolveInvitation ? invitation : null }); return true;
    }
    if (url.pathname !== '/api/convites/aceitar-codigo') return false;
    accepting = true; await pending;
    await json(route, { storeId: ids.second, membershipId: store().membershipId, role: 'PARTICIPANT' }).catch(() => {});
    finish(); return true;
  });
  await page.goto('/lojas');
  const field = page.getByRole('searchbox', { name: 'Buscar loja ou código' });
  await field.fill(code); await field.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: 'Participar da lojinha', exact: true }).click();
  await expect.poll(() => accepting).toBe(true);
  state.loggedIn = false;
  await page.evaluate(() => window.dispatchEvent(new Event('meumimo:session-changed')));
  await expect(page.getByRole('heading', { name: 'Acesse sua conta', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  release(); await delivered; await flushView(page);
  await expect(page).toHaveURL(/\/lojas$/);
  expect(await page.locator('body').innerText()).not.toContain('Ana privada');
  expect(await page.locator('body').innerText()).not.toContain('Só para esta conta.');
});

test('link compartilhado de código esgotado explica o estado sem oferecer aceite', async ({ page }) => {
  const state = await mockApi(page, async (route, url) => {
    if (url.pathname !== '/api/convites/token-code') return false;
    await json(route, { ...invitation, viewerAction: undefined, status: 'EXHAUSTED' }); return true;
  });
  state.loggedIn = false;
  await page.goto('/convites/token-code');
  await expect(page.getByText('Este convite atingiu o limite de usos. Peça um novo convite a quem convidou você.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aceitar convite', exact: true })).toHaveCount(0);
});

for (const failure of ['invitation_expired', 'invitation_exhausted', 'invitation_revoked', 'store_paused']) {
  test(`${failure} durante confirmação impede novo aceite até buscar de novo`, async ({ page }) => {
    let accepts = 0;
    await mockApi(page, async (route, url) => {
      if (url.pathname === '/api/lojas/buscar') {
        await json(route, { stores: empty, invitation: route.request().postDataJSON().resolveInvitation ? invitation : null }); return true;
      }
      if (url.pathname !== '/api/convites/aceitar-codigo') return false;
      accepts += 1; await json(route, { code: failure, message: 'Este convite não está disponível para novas participações.' }, 409); return true;
    });
    await page.goto('/lojas');
    const field = page.getByRole('searchbox', { name: 'Buscar loja ou código' });
    await field.fill(code); await field.press('Enter');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Participar da lojinha', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Este convite não está disponível');
    await expect(dialog.getByRole('button', { name: 'Participar da lojinha', exact: true })).toHaveCount(0);
    expect(accepts).toBe(1);
  });
}
