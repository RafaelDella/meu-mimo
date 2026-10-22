import { expect } from '@playwright/test';
import type { InvitationPreview } from '../../../src/contracts/stores';
import { actionsFit, ids, json, mockApi, noOverflow, store, test } from './helpers';

test('convite anônimo mostra apresentação e preserva o destino na entrada', async ({ page }) => {
  const state = await mockApi(page);
  state.loggedIn = false;
  await page.goto('/convites/token-ficticio');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Um convite para você');
  await expect(page.getByRole('heading', { name: 'Loja da Ana', exact: true })).toBeVisible();
  await expect(page.getByText('Rafa preparou esta lojinha.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aceitar convite', exact: true })).toHaveCount(0);
  const entry = page.getByRole('link', { name: 'Entrar ou criar conta', exact: true });
  const destination = new URL((await entry.getAttribute('href'))!, 'http://127.0.0.1');
  expect(destination.pathname).toBe('/conta');
  expect(destination.searchParams.get('returnTo')).toBe('/convites/token-ficticio');
  await noOverflow(page);
  await actionsFit(page);
  await page.screenshot({ path: test.info().outputPath('invitation-guest.png'), fullPage: true });
});

const states: [InvitationPreview['status'], RegExp][] = [
  ['EXPIRED', /Este convite expirou/], ['REVOKED', /Este convite foi revogado/],
  ['ACCEPTED', /Este convite já foi aceito/], ['PAUSED', /Esta loja está pausada/],
  ['CLOSED', /Esta loja foi encerrada/],
];
for (const [status, message] of states) {
  test(`convite ${status} apresenta orientação específica`, async ({ page }) => {
    const state = await mockApi(page);
    state.loggedIn = false;
    state.preview.status = status;
    await page.goto('/convites/token-ficticio');
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aceitar convite', exact: true })).toHaveCount(0);
    await noOverflow(page);
  });
}

test('convite inválido oferece consulta sem revelar loja ou pessoa', async ({ page }) => {
  await mockApi(page, async (route, url) => {
    if (!url.pathname.startsWith('/api/convites/')) return false;
    await json(route, { code: 'invitation_invalid', message: 'Confira o link com quem convidou.' }, 404);
    return true;
  });
  await page.goto('/convites/token-invalido');
  await expect(page.getByRole('heading', { name: 'Convite indisponível' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Confira o link com quem convidou.');
  await expect(page.getByRole('button', { name: 'Consultar convite novamente' })).toBeVisible();
  await expect(page.getByText('Ana privada', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Loja da Ana', exact: true })).toHaveCount(0);
});

test('aceite identifica a conta, anuncia falha e só entra depois de confirmação', async ({ page }) => {
  let attempts = 0;
  const state = await mockApi(page, async (route, url, current) => {
    if (!url.pathname.endsWith('/aceitar')) return false;
    attempts += 1;
    if (attempts === 1) await json(route, { code: 'unavailable', message: 'Não foi possível confirmar o aceite.' }, 503);
    else {
      current.stores = [store()];
      await json(route, { storeId: ids.first, membershipId: current.stores[0].membershipId, role: 'PARTICIPANT' });
    }
    return true;
  });
  state.stores = [];
  await page.goto('/convites/token-ficticio');
  await expect(page.getByText('Ana privada', { exact: true })).toBeVisible();
  const accept = page.getByRole('button', { name: 'Aceitar convite', exact: true });
  await expect(accept).toBeEnabled();
  expect(attempts).toBe(0);
  await accept.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Não foi possível confirmar o aceite.');
  await expect(page).toHaveURL(/\/convites\/token-ficticio$/);
  await accept.click();
  await expect(page).toHaveURL(new RegExp(`/lojas/${ids.first}$`));
  expect(attempts).toBe(2);
});

for (const role of ['MERCHANT', 'PARTICIPANT'] as const) {
  test(`convite reconhece vínculo ${role} sem enviar novo aceite`, async ({ page }) => {
    let acceptRequests = 0;
    const state = await mockApi(page, async (route, url) => {
      if (!url.pathname.endsWith('/aceitar')) return false;
      acceptRequests += 1;
      await json(route, {});
      return true;
    });
    state.stores = [store({ role })];
    await page.goto('/convites/token-ficticio');
    await expect(page.getByRole('link', { name: role === 'MERCHANT' ? 'Gerenciar loja' : 'Abrir loja', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aceitar convite', exact: true })).toHaveCount(0);
    expect(acceptRequests).toBe(0);
  });
}

test('trocar conta preserva apenas o destino e remove a identidade anterior', async ({ page }) => {
  const state = await mockApi(page, async (route, url, current) => {
    if (url.pathname !== '/api/auth/login') return false;
    current.loggedIn = true;
    current.userId = ids.bia;
    current.displayName = 'Bia conectada';
    await json(route, { returnTo: '/convites/token-ficticio' });
    return true;
  });
  state.stores = [];
  await page.goto('/convites/token-ficticio');
  await expect(page.getByText('Ana privada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trocar conta', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'E-mail', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/convites/token-ficticio');
  await expect(page.getByText('Ana privada', { exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill('bia@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('Senha-ficticia');
  await page.getByRole('button', { name: 'Entrar', exact: true }).last().click();
  await expect(page.getByText('Bia conectada', { exact: true })).toBeVisible();
  await expect(page.getByText('Ana privada', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aceitar convite', exact: true })).toBeEnabled();
  await noOverflow(page);
});

test('geração incerta recupera o mesmo link e revogação tem confirmação explícita', async ({ page }) => {
  const operationIds: string[] = [];
  const invitation = { id: '77777777-7777-4777-8777-777777777777', expiresAt: '2099-10-29T15:00:00Z',
    revokedAt: null as string | null, acceptedAt: null };
  let generated = false;
  let revocations = 0;
  const state = await mockApi(page, async (route, url) => {
    if (!url.pathname.includes('/convites')) return false;
    if (url.pathname.endsWith('/revogar')) {
      revocations += 1;
      if (revocations === 1) await json(route, { code: 'unavailable', message: 'Consulte o estado do convite.' }, 503);
      else { invitation.revokedAt = '2026-10-22T15:00:00Z'; await json(route, invitation); }
    } else if (route.request().method() === 'POST') {
      operationIds.push(route.request().postDataJSON().operationId as string);
      if (operationIds.length === 1) await json(route, { code: 'unavailable', message: 'Consulte o convite gerado.' }, 503);
      else if (operationIds.length === 2) await json(route, { code: 'rate_limited', message: 'Aguarde para recuperar.' }, 429);
      else { generated = true; await json(route, { ...invitation, url: '/convites/link-ficticio' }, 201); }
    } else await json(route, { items: generated ? [invitation] : [], page: 1, pageSize: 20, total: generated ? 1 : 0 });
    return true;
  });
  state.stores = [store({ role: 'MERCHANT' })];
  await page.goto(`/lojas/${ids.first}/convites`);
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recuperar convite', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Recuperar convite', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert').filter({ hasText: 'Aguarde para recuperar.' })).toBeVisible();
  await page.getByRole('button', { name: 'Recuperar convite', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Link do convite', exact: true })).toHaveValue('/convites/link-ficticio');
  expect(operationIds).toHaveLength(3);
  expect(operationIds[0]).toBe(operationIds[1]);
  expect(operationIds[0]).toBe(operationIds[2]);
  await page.getByRole('button', { name: 'Revogar convite', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revogar este convite?', exact: true });
  await expect(dialog).toBeVisible();
  expect(invitation.revokedAt).toBeNull();
  await dialog.getByRole('button', { name: 'Confirmar revogação', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Confirmar revogação', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Consultar estado do convite', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Convites', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Revogar convite', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Confirmar revogação', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Confirmar revogação', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Revogado', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Convites', exact: true })).toBeFocused();
  await noOverflow(page);
});
