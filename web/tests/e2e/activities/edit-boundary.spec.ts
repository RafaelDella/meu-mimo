import { expect } from '@playwright/test';
import { activityId, mockActivities, rootPath, test } from './helpers';

test('edição de atividade envia somente campos editáveis para a API estrita', async ({ page }) => {
  const allowed = ['name', 'description', 'category', 'sticker', 'points', 'frequency', 'weeklyLimit', 'approvalMode',
    'operationId', 'expectedVersion'].sort();
  const { state } = await mockActivities(page, { merchant: true, handler: async (route, url, current) => {
    if (route.request().method() !== 'PATCH' || !url.pathname.endsWith(`/atividades/${activityId}`)) return false;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (Object.keys(body).some(key => !allowed.includes(key))) {
      current.activityBodies.push(body);
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'field_invalid', message: 'Campo não permitido.' }) });
      return true;
    }
    return false;
  } });
  await page.goto(`${rootPath}/${activityId}/editar`);
  await page.getByLabel('Nome da atividade', { exact: true }).fill('Conquista revisada');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page).toHaveURL(`${rootPath}/${activityId}`);
  expect(state.activityBodies).toHaveLength(1); expect(Object.keys(state.activityBodies[0]).sort()).toEqual(allowed);
});
