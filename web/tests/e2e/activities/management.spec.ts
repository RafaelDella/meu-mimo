import { expect } from '@playwright/test';
import { activityId, actionsFit, mockActivities, noOverflow, rootPath, test } from './helpers';
import { json } from '../stores/helpers';

test('cadastro real começa manual, explica frequência e salva campos sem versão forjada', async ({ page }) => {
  const { state } = await mockActivities(page, { merchant: true });
  await page.goto(`${rootPath}/nova`);
  await expect(page.getByRole('heading', { name: 'Nova atividade', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Precisa da minha aprovação', exact: true })).toBeChecked();
  await page.getByLabel('Nome da atividade', { exact: true }).fill('Caminhar no parque');
  await page.getByRole('textbox', { name: 'Descrição', exact: true }).fill('Um passeio com calma.');
  await page.getByLabel('Categoria (opcional)', { exact: true }).fill('A dois');
  await page.getByRole('combobox', { name: 'Frequência', exact: true }).selectOption('WEEKLY');
  await page.getByLabel('Registros por semana', { exact: true }).fill('3');
  await page.getByLabel('Pontos por conquista aprovada', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Caminhar no parque', exact: true })).toBeVisible();
  expect(state.activityBodies).toHaveLength(1);
  expect(state.activityBodies[0]).toMatchObject({ name: 'Caminhar no parque', description: 'Um passeio com calma.', category: 'A dois', frequency: 'WEEKLY', weeklyLimit: 3, points: 20, approvalMode: 'MANUAL' });
  expect(state.activityBodies[0]).not.toHaveProperty('expectedVersion');
});

test('arquivo exige confirmação, Escape retorna foco e histórico continua acessível', async ({ page }) => {
  await mockActivities(page, { merchant: true });
  await page.goto(`${rootPath}/${activityId}`);
  const trigger = page.getByRole('button', { name: 'Arquivar atividade', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Arquivar esta atividade?', exact: true });
  await expect(dialog).toContainText('As conquistas anteriores, fotos, conversas e pontos continuam no histórico.');
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog.getByRole('button', { name: 'Confirmar arquivamento', exact: true }).click();
  await expect(page.getByText('Atividade arquivada. As conquistas anteriores continuam no histórico.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ler algumas páginas', exact: true })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Editar atividade', exact: true })).toHaveCount(0);
});

test('edição em conflito preserva campos e exige carregar explicitamente versão atual', async ({ page }) => {
  let conflict = true;
  const { state } = await mockActivities(page, { merchant: true, handler: async (route, url, current) => {
    if (route.request().method() === 'PATCH' && url.pathname.endsWith(`/atividades/${activityId}`) && conflict) {
      conflict = false; current.activity = { ...current.activity, version: 2, points: 25 };
      await json(route, { code: 'activity_changed', message: 'A atividade mudou. Revise a versão atual.' }, 409); return true;
    }
    return false;
  } });
  await page.goto(`${rootPath}/${activityId}/editar`);
  await page.getByLabel('Nome da atividade', { exact: true }).fill('Minha alteração preservada');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.getByLabel('Nome da atividade', { exact: true })).toHaveValue('Minha alteração preservada');
  await page.getByRole('button', { name: 'Carregar versão atual', exact: true }).click();
  await expect(page.getByLabel('Pontos por conquista aprovada', { exact: true })).toHaveValue('25');
  await page.getByLabel('Nome da atividade', { exact: true }).fill('Alteração revisada');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alteração revisada', exact: true })).toBeVisible();
  expect(state.activityBodies[0]).toMatchObject({ expectedVersion: 2, name: 'Alteração revisada' });
});

test('participante vê saldo exato, contagens sem percentual e busca real do catálogo', async ({ page }) => {
  const { state } = await mockActivities(page);
  await page.goto(rootPath);
  await expect(page.getByLabel('Seu potinho de pontos')).toContainText('9.007.199.254.740.993');
  await expect(page.getByRole('heading', { name: 'Hoje nesta loja', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Nova atividade', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ler algumas páginas', exact: true })).toBeVisible();
  await page.screenshot({ path: `.artifacts/t07-catalog-${page.viewportSize()!.width}.png`, fullPage: true });
  const activitiesLabel = page.getByRole('navigation', { name: 'Sua participação', exact: true })
    .getByRole('link', { name: 'Atividades', exact: true }).getByText('Atividades', { exact: true });
  const lines = await activitiesLabel.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    return range.getClientRects().length;
  });
  expect(lines, 'A navegação deve mostrar Atividades sem partir a palavra.').toBe(1);
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath('activities-desktop.png'), fullPage: true });
  await page.setViewportSize(viewport);
  await page.getByLabel('Buscar atividade', { exact: true }).fill('inexistente');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText(/Nenhuma atividade encontrada/)).toBeVisible();
  expect(state.listQueries[state.listQueries.length - 1]?.get('q')).toBe('inexistente');
  await page.getByRole('button', { name: 'Meus registros', exact: true }).click();
  await page.getByRole('combobox', { name: 'Situação', exact: true }).selectOption('APPROVED');
  await page.getByLabel('Desde a data', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Até a data', { exact: true }).fill('2026-10-22');
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect.poll(() => state.recordQueries[state.recordQueries.length - 1]?.get('status')).toBe('APPROVED');
  expect(state.recordQueries[state.recordQueries.length - 1]?.get('from')).toBe('2026-10-01');
  expect(state.recordQueries[state.recordQueries.length - 1]?.get('to')).toBe('2026-10-22');
});

test('formulário continua utilizável com teclado, texto a 200% e movimento reduzido', async ({ page }) => {
  await mockActivities(page, { merchant: true });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`${rootPath}/nova`);
  const name = page.getByLabel('Nome da atividade', { exact: true }); await name.focus(); await page.keyboard.type('Uma pequena conquista');
  await page.keyboard.press('Tab'); await expect(page.getByRole('textbox', { name: 'Descrição', exact: true })).toBeFocused();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await noOverflow(page); await actionsFit(page);
  await expect(page.getByRole('button', { name: 'Salvar atividade', exact: true })).toBeEnabled();
  await page.screenshot({ path: `.artifacts/t07-form-${page.viewportSize()!.width}-200.png`, fullPage: true });
});
