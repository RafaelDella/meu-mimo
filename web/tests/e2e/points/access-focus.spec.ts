import { expect } from '@playwright/test';
import { mockReview, originPath, statementPath, test } from './helpers';
import { json } from '../stores/helpers';

for (const resource of ['balance', 'people'] as const) {
  for (const status of [401, 403, 404]) test(`${status} ao reler ${resource === 'balance' ? 'saldo' : 'pessoas'} limpa o extrato inteiro já consultado`, async ({ page }) => {
    let deny = false;
    const { auth } = await mockReview(page, { merchant: resource === 'people', status: 'APPROVED', handler: async (route, url, current) => {
      const selected = resource === 'balance' ? url.pathname.endsWith('/pontos') : url.pathname.endsWith('/participacoes');
      if (!selected) return false;
      if (deny) {
        await json(route, { code: status === 401 ? 'session_invalid' : 'resource_not_found', message: status === 401 ? 'Entre novamente na sua conta.' : 'Conteúdo indisponível.' }, status);
        return true;
      }
      if (resource === 'people') {
        await json(route, { items: [{ id: current.current.participantMembershipId, role: 'PARTICIPANT', profile: { displayName: 'Pessoa privada do extrato' } }],
          page: 1, pageSize: 20, total: 1 });
        return true;
      }
      return false;
    } });
    await page.goto(statementPath);
    await expect(page.getByRole('heading', { name: '+15 pontos · Leitura da ocasião', exact: true })).toBeVisible();
    if (resource === 'balance') await expect(page.locator('.ui-points')).toBeVisible();
    else await expect(page.getByRole('combobox', { name: 'Pessoa do extrato', exact: true })).toBeVisible();
    deny = true;
    if (status === 401) auth.loggedIn = false;
    if (resource === 'balance') {
      await page.getByRole('combobox', { name: 'Tipo de movimento', exact: true }).selectOption('ACTIVITY_CREDIT');
      await page.getByRole('button', { name: 'Filtrar extrato', exact: true }).click();
    } else {
      await page.getByRole('searchbox', { name: 'Buscar pessoa no extrato', exact: true }).fill('Pessoa');
      await page.getByRole('button', { name: 'Buscar pessoas no extrato', exact: true }).click();
    }
    if (status === 401) await expect(page.getByRole('heading', { name: 'Acesse sua conta', exact: true })).toBeVisible();
    else {
      await expect(page.getByRole('heading', { name: /indisponível|indisponíveis/i })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Entrar na conta', exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('heading', { name: '+15 pontos · Leitura da ocasião', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Abrir origem do movimento/ })).toHaveCount(0);
    await expect(page.locator('.ui-points')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Pessoa do extrato', exact: true })).toHaveCount(0);
  });
}

for (const action of ['approve', 'void'] as const) test(`confirmar ${action === 'approve' ? 'aprovação' : 'anulação'} leva foco ao título após remover o botão original`, async ({ page }) => {
  await mockReview(page, { status: action === 'approve' ? 'PENDING' : 'APPROVED' });
  await page.goto(originPath);
  const trigger = page.getByRole('button', { name: action === 'approve' ? 'Aprovar registro' : 'Anular registro', exact: true });
  await trigger.click();
  if (action === 'void') await page.getByRole('textbox', { name: 'Motivo da decisão', exact: true }).fill('Corrigir a aprovação desta ocasião.');
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Análise deste registro', exact: true })).toBeFocused();
});
