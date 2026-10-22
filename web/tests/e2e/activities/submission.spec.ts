import { expect } from '@playwright/test';
import { actionsFit, confirm, mockActivities, noOverflow, registerPath, rootPath, test } from './helpers';
import { json } from '../stores/helpers';

async function openForm(page: import('@playwright/test').Page) {
  await page.goto(registerPath);
  await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeEnabled();
}

test('envio manual sem foto confirma pendência e preserva legenda e contexto', async ({ page }) => {
  const { state } = await mockActivities(page); await openForm(page);
  await page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true }).fill('Li um capítulo com calma.');
  await page.getByRole('button', { name: 'Enviar registro', exact: true }).click();
  await expect(page.getByText('Conquista enviada! Seus 15 pontos aguardam aprovação e ainda não estão disponíveis.', { exact: true })).toBeVisible();
  await expect(page.getByText('Li um capítulo com calma.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conversa deste item', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir conquista confirmada', exact: true })).toBeVisible();
  await page.screenshot({ path: `.artifacts/t07-submission-${page.viewportSize()!.width}.png`, fullPage: true });
  expect(state.finalBodies).toHaveLength(1); expect(state.finalBodies[0]).toMatchObject({ caption: 'Li um capítulo com calma.', evidenceAssetId: null, expectedVersion: 1, expectedLocalDate: '2026-10-22', expectedTimezone: 'America/Sao_Paulo' });
  expect([...state.drafts.values()][0].pointsState).toBe('PENDING');
});

test('resposta perdida após crédito consulta o mesmo registro sem novo POST', async ({ page }) => {
  const { state } = await mockActivities(page, { automatic: true, handler: async (route, url, current) => {
    if (url.pathname.endsWith('/enviar')) {
      const parts = url.pathname.split('/'); const id = parts[parts.length - 2]; const body = route.request().postDataJSON();
      current.finalBodies.push(body); current.finalCalls.push(`POST:${id}`); confirm(current, id, body);
      await route.abort('failed'); return true;
    }
    return false;
  } });
  await openForm(page); state.finalCalls.length = 0;
  await page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true }).fill('Legenda preservada na falha.');
  await page.getByRole('button', { name: 'Enviar registro', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true })).toHaveValue('Legenda preservada na falha.');
  await expect(page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true })).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Consultar envio', exact: true }).click();
  await expect(page.getByText('Conquista registrada! +15 pontos confirmados nesta loja.', { exact: true })).toBeVisible();
  expect(state.finalBodies).toHaveLength(1);
  expect(state.finalCalls.map(value => value.split(':')[0])).toEqual(['POST', 'GET']);
});

for (const status of [503, 429]) test(`falha ${status} mantém corpo e consulta antes de repetir o envio`, async ({ page }) => {
  let failed = false;
  const { state } = await mockActivities(page, { handler: async (route, url, current) => {
    if (!failed && url.pathname.endsWith('/enviar')) {
      const parts = url.pathname.split('/');
      failed = true; current.finalBodies.push(route.request().postDataJSON()); current.finalCalls.push(`POST:${parts[parts.length - 2]}`);
      await json(route, { code: 'temporarily_unavailable', message: 'Aguarde e consulte o mesmo envio.' }, status); return true;
    }
    return false;
  } });
  await openForm(page); state.finalCalls.length = 0;
  await page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true }).fill('Uma tentativa, uma conquista.');
  await page.getByRole('button', { name: 'Enviar registro', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true })).toHaveValue('Uma tentativa, uma conquista.');
  await page.getByRole('button', { name: 'Consultar envio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Envio confirmado', exact: true })).toBeVisible();
  expect(state.finalCalls.map(value => value.split(':')[0])).toEqual(['POST', 'GET', 'POST']);
  expect(state.finalBodies[1]).toEqual(state.finalBodies[0]); expect(state.prepares).toHaveLength(1);
});

test('mudança de regra pede revisão explícita e mantém a legenda antes de confirmar', async ({ page }) => {
  let changed = false;
  const { state } = await mockActivities(page, { handler: async (route, url, current) => {
    if (!changed && url.pathname.endsWith('/enviar')) {
      changed = true; current.finalBodies.push(route.request().postDataJSON());
      current.activity = { ...current.activity, version: 2, points: 30 };
      await json(route, { code: 'activity_changed', message: 'A regra mudou. Revise a atividade atual.' }, 409); return true;
    }
    return false;
  } });
  await openForm(page); await page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true }).fill('Minha legenda continua aqui.');
  await page.getByRole('button', { name: 'Enviar registro', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true })).toHaveValue('Minha legenda continua aqui.');
  await page.getByRole('button', { name: 'Revisar regras e data', exact: true }).click();
  await expect(page.getByText('30 pontos por conquista aprovada', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Enviar registro', exact: true }).click();
  await expect(page.getByText('Conquista enviada! Seus 30 pontos aguardam aprovação e ainda não estão disponíveis.', { exact: true })).toBeVisible();
  expect(state.finalBodies[1]).toMatchObject({ caption: 'Minha legenda continua aqui.', expectedVersion: 2 });
});

test('foto escolhida bloqueia confirmação até ficar pronta e é preservada na origem', async ({ page }) => {
  const { state } = await mockActivities(page); await openForm(page);
  const gallery = page.getByLabel('Escolher arquivos da galeria', { exact: true });
  await gallery.setInputFiles({ name: 'nao-aceita.heic', mimeType: 'image/heic', buffer: Buffer.from('arquivo sintético inválido') });
  await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remover arquivo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeEnabled();
  await gallery.setInputFiles({ name: 'conquista.png', mimeType: 'image/png', buffer: Buffer.from('foto sintética para o contrato controlado') });
  await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true }).click();
  await expect(page.getByText('Recebido. Preparando a mídia para consulta.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeDisabled();
  state.mediaReady = true; await page.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeEnabled();
  await noOverflow(page); await actionsFit(page);
  await page.getByRole('button', { name: 'Enviar registro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Envio confirmado', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover arquivo', exact: true })).toHaveCount(0);
  expect(state.finalBodies[0].evidenceAssetId).toBe([...state.assets.keys()][0]);
});

test('retorno após sair da conta descarta legenda e conteúdo privado', async ({ page }) => {
  const { auth } = await mockActivities(page); await openForm(page);
  await page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true }).fill('Segredo do rascunho anterior.');
  auth.loggedIn = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Acesse sua conta', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true })).toHaveCount(0);
  await expect(page.getByText('Segredo do rascunho anterior.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ler algumas páginas', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Entrar na conta', exact: true })).toHaveAttribute('href', new RegExp(encodeURIComponent(rootPath)));
});
