import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CodeInvitationCreated, CodeInvitationInput, ManagedInvitation } from '../../../src/contracts/invitations';
import { actionsFit, ids, json, mockApi, noOverflow, store, test } from './helpers';

const invitationId = '77777777-7777-4777-8777-777777777777';
const generated: CodeInvitationCreated = {
  id: invitationId, kind: 'CODE', code: '7KQ9M4TX2P', url: '/convites/link-ficticio',
  expiresAt: '2099-10-29T15:00:00Z', revokedAt: null, maxUses: 1, useCount: 0, status: 'PENDING',
};

async function management(page: Page, settings: { invitations?: ManagedInvitation[]; uncertain?: boolean; rateLimited?: boolean; expirationPastAfterLoss?: boolean;
  candidates?: { at: string; offset: string }[] } = {}) {
  const creations: CodeInvitationInput[] = [];
  const dates: string[] = [];
  let invitations = settings.invitations ?? [];
  let revelations = 0;
  const state = await mockApi(page, async (route, url) => {
    if (!url.pathname.includes('/convites')) return false;
    if (url.pathname.endsWith('/credencial')) {
      revelations += 1;
      await json(route, { id: invitationId, code: generated.code, url: generated.url });
    } else if (url.pathname.endsWith('/prazo')) {
      const localDateTime = route.request().postDataJSON().localDateTime as string;
      dates.push(localDateTime);
      await json(route, { timezone: 'America/New_York', candidates: settings.candidates ?? [
        { at: `${localDateTime}:00-04:00`, offset: '-04:00' },
      ] });
    } else if (url.pathname.endsWith('/revogar')) {
      invitations = invitations.map(item => item.id === invitationId ? { ...item, revokedAt: '2026-10-23T15:00:00Z',
        ...('kind' in item ? { status: 'REVOKED' as const } : {}) } : item);
      await json(route, invitations[0]);
    } else if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as CodeInvitationInput;
      creations.push(input);
      if (settings.rateLimited && creations.length === 1) {
        await route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Retry-After': '2' },
          body: JSON.stringify({ code: 'rate_limited', message: 'Aguarde para recuperar.' }) });
      } else if (settings.uncertain && creations.length === 1) {
        await json(route, { code: 'unavailable', message: 'Confira a mesma solicitação.' }, 503);
      } else if (settings.expirationPastAfterLoss && creations.length === 2) {
        await json(route, { code: 'invitation_expiration_past', message: 'Escolha uma data de validade futura.' }, 400);
      } else {
        const value = { ...generated, id: input.operationId, maxUses: input.maxUses,
          expiresAt: input.expiration.kind === 'NEVER' ? null : generated.expiresAt };
        invitations = [value];
        await json(route, value, 201);
      }
    } else await json(route, { items: invitations, page: 1, pageSize: 20, total: invitations.length });
    return true;
  });
  state.stores = [store({ role: 'MERCHANT', timezone: 'America/New_York' })];
  await page.goto(`/lojas/${ids.first}/convites`);
  await expect(page.getByRole('heading', { name: 'Convites', exact: true })).toBeVisible();
  return { creations, dates, revealed: () => revelations };
}

test('gera código segmentado com sete dias e uma participação por padrão', async ({ page }) => {
  const result = await management(page);
  await expect(page.getByRole('combobox', { name: 'Validade do convite', exact: true })).toHaveValue('AFTER_DAYS');
  await expect(page.getByRole('combobox', { name: 'Limite de participantes', exact: true })).toHaveValue('LIMITED');
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Código de convite: 7KQ9M-4TX2P', exact: true })).toBeVisible();
  expect(result.creations).toHaveLength(1);
  expect(result.creations[0]).toMatchObject({ kind: 'CODE', expiration: { kind: 'AFTER_DAYS', days: 7 }, maxUses: 1 });
  await expect(page.getByRole('textbox', { name: 'Link do convite', exact: true })).toHaveValue(generated.url);
  await expect(page.getByRole('button', { name: 'Copiar código', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Configuração do próximo convite', exact: true }).getByText('1 nova participação', { exact: true })).toBeVisible();
  await noOverflow(page);
  await actionsFit(page);
});

test('sem vencimento e participantes ilimitados são escolhas independentes', async ({ page }) => {
  const result = await management(page);
  await page.getByRole('combobox', { name: 'Validade do convite', exact: true }).selectOption('NEVER');
  await page.getByRole('combobox', { name: 'Limite de participantes', exact: true }).selectOption('UNLIMITED');
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Código de convite: 7KQ9M-4TX2P' })).toBeVisible();
  expect(result.creations[0]).toMatchObject({ expiration: { kind: 'NEVER' }, maxUses: null });
  await expect(page.getByText('Sem vencimento', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Participações ilimitadas', { exact: true }).last()).toBeVisible();
});

test('limite inválido apresenta erro associado e não envia criação', async ({ page }) => {
  const result = await management(page);
  const limit = page.getByLabel('Máximo de novas participações', { exact: true });
  await limit.fill('0');
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect(limit).toHaveAttribute('aria-invalid', 'true');
  await expect(limit).toBeFocused();
  await expect(page.getByText('Informe um inteiro entre 1 e 1.000.000.', { exact: true })).toBeVisible();
  expect(result.creations).toHaveLength(0);
});

test('recuperação incerta mantém operação e política originais', async ({ page }) => {
  const result = await management(page, { uncertain: true });
  await page.getByRole('combobox', { name: 'Validade do convite', exact: true }).selectOption('NEVER');
  await page.getByLabel('Máximo de novas participações', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recuperar convite', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Validade do convite', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Máximo de novas participações', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Recuperar convite', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Código de convite: 7KQ9M-4TX2P' })).toBeVisible();
  expect(result.creations).toHaveLength(2);
  expect(result.creations[1]).toEqual(result.creations[0]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(generated.code);
  expect(page.url()).not.toContain(generated.code);
});

test('data personalizada exige conferência e usa offset do fuso da loja', async ({ page }) => {
  const result = await management(page);
  await page.evaluate(() => {
    let changes = 0;
    window.addEventListener('meumimo:relationship-changed', () => { changes += 1; });
    Object.defineProperty(window, 'invitationReadChanges', { get: () => changes });
  });
  await page.getByRole('combobox', { name: 'Validade do convite', exact: true }).selectOption('AT');
  const date = page.getByLabel('Data e hora de vencimento', { exact: true });
  await date.fill('2099-10-29T12:00');
  await page.getByRole('button', { name: 'Conferir data e hora', exact: true }).click();
  await expect(page.getByText(/Vencimento conferido/)).toBeVisible();
  expect(result.dates).toEqual(['2099-10-29T12:00']);
  expect(await page.evaluate(() => Reflect.get(window, 'invitationReadChanges'))).toBe(0);
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect.poll(() => result.creations.length).toBe(1);
  expect(result.creations[0].expiration).toEqual({ kind: 'AT', at: '2099-10-29T12:00:00-04:00' });
  await date.fill('2099-10-30T12:00');
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect(date).toHaveAttribute('aria-invalid', 'true');
  expect(result.creations).toHaveLength(1);
});

test('prazo vencido após falha incerta libera correção com uma nova operação', async ({ page }) => {
  const result = await management(page, { uncertain: true, expirationPastAfterLoss: true });
  await page.getByRole('combobox', { name: 'Validade do convite', exact: true }).selectOption('AT');
  const date = page.getByLabel('Data e hora de vencimento', { exact: true });
  await date.fill('2099-10-29T12:00');
  await page.getByRole('button', { name: 'Conferir data e hora', exact: true }).click();
  await expect(page.getByText(/Vencimento conferido/)).toBeVisible();
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect(date).toBeDisabled();
  await page.getByRole('button', { name: 'Recuperar convite', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gerar convite', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Validade do convite', exact: true })).toBeEnabled();
  await expect(date).toBeEnabled();
  await expect(date).toHaveAttribute('aria-invalid', 'true');
  expect(result.creations).toHaveLength(2);
  expect(result.creations[1]).toEqual(result.creations[0]);
  await date.fill('2099-10-30T12:00');
  await page.getByRole('button', { name: 'Conferir data e hora', exact: true }).click();
  await expect(page.getByText(/Vencimento conferido/)).toBeVisible();
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Código de convite: 7KQ9M-4TX2P' })).toBeVisible();
  expect(result.creations).toHaveLength(3);
  expect(result.creations[2].operationId).not.toBe(result.creations[0].operationId);
  expect(result.creations[2].expiration).toEqual({ kind: 'AT', at: '2099-10-30T12:00:00-04:00' });
});

test('data personalizada vazia mantém foco e não consulta nem gera convite', async ({ page }) => {
  const result = await management(page);
  await page.getByRole('combobox', { name: 'Validade do convite', exact: true }).selectOption('AT');
  await page.getByRole('button', { name: 'Conferir data e hora', exact: true }).click();
  await expect(page.getByLabel('Data e hora de vencimento', { exact: true })).toBeFocused();
  await expect(page.getByText('Informe a data e a hora no fuso da loja.', { exact: true })).toBeVisible();
  expect(result.dates).toEqual([]);
  expect(result.creations).toEqual([]);
});

test('limite de tentativas respeita Retry-After e conserva a operação', async ({ page }) => {
  const result = await management(page, { rateLimited: true });
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  const recover = page.getByRole('button', { name: 'Recuperar convite', exact: true });
  await expect(recover).toBeDisabled();
  await expect(page.getByText(/Aguarde \d segundos para recuperar/)).toBeVisible();
  await expect(recover).toBeEnabled();
  await recover.click();
  await expect(page.getByRole('group', { name: 'Código de convite: 7KQ9M-4TX2P' })).toBeVisible();
  expect(result.creations).toHaveLength(2);
  expect(result.creations[1]).toEqual(result.creations[0]);
});

test('copiar e compartilhar indisponíveis oferecem campos selecionáveis com foco', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await management(page);
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await page.getByRole('button', { name: 'Copiar código', exact: true }).click();
  const code = page.getByRole('textbox', { name: 'Código para copiar', exact: true });
  await expect(code).toHaveValue('7KQ9M-4TX2P');
  await expect(code).toBeFocused();
  await page.getByRole('button', { name: 'Compartilhar convite', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Link do convite', exact: true })).toBeFocused();
  await noOverflow(page);
});

test('horário civil inexistente é explicado junto ao campo', async ({ page }) => {
  const result = await management(page, { candidates: [] });
  await page.getByRole('combobox', { name: 'Validade do convite', exact: true }).selectOption('AT');
  const date = page.getByLabel('Data e hora de vencimento', { exact: true });
  await date.fill('2099-03-08T02:30');
  await page.getByRole('button', { name: 'Conferir data e hora', exact: true }).click();
  await expect(page.getByText(/Este horário não existe no fuso da loja/)).toBeVisible();
  await expect(date).toHaveAttribute('aria-invalid', 'true');
  expect(result.creations).toHaveLength(0);
});

test('horário repetido exige escolha explícita de um dos offsets', async ({ page }) => {
  const result = await management(page, { candidates: [
    { at: '2099-11-01T01:30:00-04:00', offset: '-04:00' },
    { at: '2099-11-01T01:30:00-05:00', offset: '-05:00' },
  ] });
  await page.getByRole('combobox', { name: 'Validade do convite', exact: true }).selectOption('AT');
  await page.getByLabel('Data e hora de vencimento', { exact: true }).fill('2099-11-01T01:30');
  await page.getByRole('button', { name: 'Conferir data e hora', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Escolha qual ocorrência deste horário' })).toBeVisible();
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  expect(result.creations).toHaveLength(0);
  await page.getByRole('radio', { name: /UTC-05:00/ }).check();
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect.poll(() => result.creations.length).toBe(1);
  expect(result.creations[0].expiration).toEqual({ kind: 'AT', at: '2099-11-01T01:30:00-05:00' });
});

test('listagem revela credencial sob ação e revoga mesmo após usos', async ({ page }) => {
  const result = await management(page, { invitations: [{ ...generated, maxUses: 5, useCount: 2 }] });
  await expect(page.getByRole('group', { name: 'Código de convite: 7KQ9M-4TX2P' })).toHaveCount(0);
  await expect(page.getByText('2 de 5 novas participações', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revelar código', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Código de convite: 7KQ9M-4TX2P' })).toBeVisible();
  expect(result.revealed()).toBe(1);
  await page.getByRole('button', { name: 'Revogar convite', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revogar este convite?', exact: true });
  await expect(dialog).toContainText('Quem já participa continua na lojinha.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Revogar convite', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Revogar convite', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar revogação', exact: true }).click();
  await expect(page.getByText('Revogado', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Convites', exact: true })).toBeFocused();
});

test('gestão ajusta visor e ações em desktop, texto ampliado e movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await management(page);
  await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Código de convite: 7KQ9M-4TX2P' })).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await noOverflow(page);
  await actionsFit(page);
  await page.screenshot({ path: test.info().outputPath('invitation-management-mobile-200.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await noOverflow(page);
  await actionsFit(page);
  await page.screenshot({ path: test.info().outputPath('invitation-management-desktop-200.png'), fullPage: true });
});
