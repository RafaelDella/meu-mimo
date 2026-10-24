import { expect } from '@playwright/test';
import type { ResolvedCodeInvitation } from '../../../src/contracts/invitations';
import { actionsFit, ids, json, mockApi, noOverflow, store, test } from './helpers';

const code = '7KQ9M4TX2P';
function preview(action: ResolvedCodeInvitation['viewerAction'] = 'JOIN'): ResolvedCodeInvitation {
  return { status: 'PENDING', store: { id: ids.second, name: 'Lojinha convidada', presentation: 'Gestos que aproximam.' },
    inviter: { displayName: 'Rafa' }, viewerAction: action };
}

test('busca exata mantém nomes, cancelar não aceita e confirmação aceita uma vez', async ({ page }) => {
  let accepts = 0;
  const inputs: Record<string, unknown>[] = [];
  await mockApi(page, async (route, url, state) => {
    if (url.pathname === '/api/lojas/buscar') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      inputs.push(body);
      await json(route, { stores: { items: [store({ name: code })], page: Number(body.page), pageSize: 20, total: 21 },
        invitation: body.resolveInvitation ? preview() : null });
      return true;
    }
    if (url.pathname !== '/api/convites/aceitar-codigo') return false;
    expect(route.request().postDataJSON()).toEqual({ code });
    accepts += 1;
    const joined = store({ id: ids.second, name: 'Lojinha convidada' });
    state.stores.push(joined);
    await json(route, { storeId: joined.id, membershipId: joined.membershipId, role: joined.role });
    return true;
  });
  await page.goto('/lojas');
  await expect(page.getByRole('heading', { name: code, exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as Window & { relationshipReads?: number }).relationshipReads = 0;
    window.addEventListener('meumimo:relationship-changed', () => {
      const counted = window as Window & { relationshipReads?: number }; counted.relationshipReads = (counted.relationshipReads ?? 0) + 1;
    });
  });
  const search = page.getByRole('searchbox', { name: 'Buscar loja ou código' });
  const before = inputs.length;
  await search.fill('7kq9m-4tx2p');
  expect(inputs).toHaveLength(before);
  await search.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Quer fazer parte desta lojinha?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Ana privada', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('group', { name: /^Código de convite:/ })).toBeVisible();
  expect(accepts).toBe(0);
  expect(await page.evaluate(() => (window as Window & { relationshipReads?: number }).relationshipReads)).toBe(0);
  await dialog.getByRole('button', { name: 'Agora não', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(search).toBeFocused();
  await expect(page.getByRole('heading', { name: code, exact: true })).toBeVisible();
  expect(accepts).toBe(0);
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect.poll(() => inputs[inputs.length - 1]?.page).toBe(2);
  expect(inputs[inputs.length - 1]?.resolveInvitation).toBe(false);
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Mostrar lojas').selectOption('CLOSED');
  await expect.poll(() => inputs[inputs.length - 1]?.state).toBe('CLOSED');
  expect(inputs[inputs.length - 1]?.resolveInvitation).toBe(false);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Participar da lojinha', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lojas/${ids.second}$`));
  expect(accepts).toBe(1);
  expect(page.url()).not.toContain(code);
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain(code);
  await noOverflow(page);
});

for (const action of ['OPEN', 'MANAGE', 'HISTORY', 'UNAVAILABLE'] as const) {
  test(`confirmação preserva ação ${action} sem enviar aceite`, async ({ page }) => {
    let accepts = 0;
    await mockApi(page, async (route, url) => {
      if (url.pathname === '/api/lojas/buscar') {
        const body = route.request().postDataJSON();
        await json(route, { stores: { items: [], page: 1, pageSize: 20, total: 0 }, invitation: body.resolveInvitation ? preview(action) : null });
        return true;
      }
      if (url.pathname !== '/api/convites/aceitar-codigo') return false;
      accepts += 1; await json(route, {}); return true;
    });
    await page.goto('/lojas');
    const field = page.getByRole('searchbox', { name: 'Buscar loja ou código' });
    await field.fill(code); await field.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Participar da lojinha', exact: true })).toHaveCount(0);
    if (action !== 'UNAVAILABLE') await expect(dialog.getByRole('link', {
      name: action === 'MANAGE' ? 'Gerenciar lojinha' : action === 'HISTORY' ? 'Consultar histórico' : 'Abrir lojinha', exact: true,
    })).toHaveAttribute('href', `/lojas/${ids.second}`);
    else await expect(dialog.getByText('Este convite não permite uma nova participação agora.')).toBeVisible();
    expect(accepts).toBe(0);
  });
}

test('confirmação mantém foco, colagem e legibilidade no celular e desktop', async ({ page }) => {
  await mockApi(page, async (route, url) => {
    if (url.pathname !== '/api/lojas/buscar') return false;
    await json(route, { stores: { items: [], page: 1, pageSize: 20, total: 0 },
      invitation: route.request().postDataJSON().resolveInvitation ? preview() : null }); return true;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lojas');
  const field = page.getByRole('searchbox', { name: 'Buscar loja ou código' });
  await field.fill('7kq9m-4tx2p'); await field.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Participar da lojinha', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Participar da lojinha', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await noOverflow(page); await actionsFit(page);
  await page.screenshot({ path: test.info().outputPath('invitation-join-200.png'), fullPage: true });
  await page.keyboard.press('Escape'); await expect(field).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  await field.press('Enter'); await expect(dialog).toBeVisible();
  await noOverflow(page);
  expect(await page.evaluate(() => document.getAnimations().filter(item => item.playState === 'running').length)).toBe(0);
});
