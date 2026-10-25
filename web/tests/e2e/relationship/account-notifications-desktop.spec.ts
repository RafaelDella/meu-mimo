import { expect } from '@playwright/test';
import { test, mockRelationship, ids, noOverflow, group, actionsFit, json, refresh } from './helpers';

test('conta organiza perfil e segurança em colunas e mantém saída visível no desktop', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockRelationship(page); await page.goto('/conta');
  const profile = page.getByRole('region', { name: 'Como você quer aparecer?', exact: true });
  const mfa = page.getByRole('region', { name: 'Verificação em duas etapas', exact: true });
  await expect(page.getByLabel('Seu nome', { exact: true })).toBeVisible();
  await page.screenshot({ path: `.artifacts/conta-desktop-${info.project.name}.png`, fullPage: true });
  const first = await profile.boundingBox(); const second = await mfa.boundingBox();
  expect(second!.x).toBeGreaterThan(first!.x + first!.width);
  await expect(page.getByRole('button', { name: 'Sair da conta', exact: true })).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Preferências de novidades', exact: true })).toBeInViewport();
  await page.getByRole('combobox', { name: 'Loja das preferências', exact: true }).selectOption(ids.first);
  await expect(page.getByLabel('Silenciar interações desta loja', { exact: true })).toBeVisible();
  await noOverflow(page);
});

test('novidades aproxima filtros e lista sem empurrar a primeira ação no desktop', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockRelationship(page); await page.goto('/notificacoes');
  const card = page.getByRole('article').first();
  await expect(card).toBeVisible();
  await page.screenshot({ path: `.artifacts/novidades-desktop-${info.project.name}.png`, fullPage: true });
  const selector = await page.getByRole('combobox', { name: 'Loja', exact: true }).boundingBox();
  const item = await card.boundingBox();
  expect(item!.x).toBeGreaterThan(selector!.x + selector!.width);
  await expect(page.getByRole('button', { name: 'Abrir novidade', exact: true })).toBeInViewport();
  await noOverflow(page);
});

test('contador global não adota o zero da loja filtrada', async ({ page }) => {
  const { state } = await mockRelationship(page);
  state.groups[0].unreadCount = 0;
  state.groups.push({ ...group(), id: '99999999-9999-4999-8999-222222222222', storeId: ids.second, storeName: 'Outra lojinha' });
  await page.goto('/notificacoes');
  await expect(page.getByText('1 grupo pede sua atenção.', { exact: true })).toBeVisible();
  const filtered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/notificacoes/grupos' && new URL(response.url()).searchParams.get('storeId') === ids.first);
  await page.getByRole('combobox', { name: 'Loja', exact: true }).selectOption(ids.first); await filtered;
  await expect(page.getByText('Lido', { exact: true })).toBeVisible();
  await expect(page.getByText('1 grupo pede sua atenção.', { exact: true })).toBeVisible();
  await expect(page.getByText('1 grupo neste filtro', { exact: true })).toBeVisible();
});

test('resposta lenta de leitura preserva foco de quem já mudou de controle', async ({ page }) => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await mockRelationship(page, { handler: async (route, url) => {
    if (route.request().method() === 'POST' && url.pathname.endsWith('/lida')) await pending;
    return false;
  } });
  await page.goto('/notificacoes');
  await page.getByRole('button', { name: 'Marcar grupo como lido', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Marcar grupo como lido', exact: true })).toHaveAttribute('aria-disabled', 'true');
  const category = page.getByRole('combobox', { name: 'Categoria', exact: true });
  await category.focus(); release();
  await expect(page.getByText('Lido', { exact: true })).toBeVisible();
  await expect(category).toBeFocused();
});

test('leitura por teclado devolve foco ao cartão quando o acionador desaparece', async ({ page }) => {
  await mockRelationship(page); await page.goto('/notificacoes');
  const read = page.getByRole('button', { name: 'Marcar grupo como lido', exact: true });
  await read.focus(); await read.press('Enter');
  await expect(read).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Loja da Ana', exact: true })).toBeFocused();
});

test('limpar filtros restaura categoria, loja, busca do seletor e resultados', async ({ page }) => {
  await mockRelationship(page); await page.goto('/notificacoes');
  await page.getByRole('combobox', { name: 'Loja', exact: true }).selectOption(ids.first);
  await page.getByRole('combobox', { name: 'Categoria', exact: true }).selectOption('NOTES');
  await expect(page.getByText('Nenhuma novidade neste filtro.', { exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Buscar loja para selecionar', exact: true });
  await search.fill('Ana'); await page.getByRole('button', { name: 'Buscar lojas', exact: true }).click();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Loja', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Categoria', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Abrir novidade', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Limpar filtros', exact: true })).toBeFocused();
});

test('conta e novidades empilham no celular e com texto ampliado sem cortar ações', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await mockRelationship(page);
  for (const path of ['/conta', '/notificacoes']) {
    await page.setViewportSize({ width: 320, height: 800 }); await page.goto(path);
    await expect(page.getByRole('heading', { name: path === '/conta' ? 'Minha conta' : 'Novidades', exact: true })).toBeVisible();
    if (path === '/conta') await page.getByRole('combobox', { name: 'Loja das preferências', exact: true }).selectOption(ids.first);
    await noOverflow(page); await actionsFit(page);
    await page.screenshot({ path: `.artifacts/gestao-${path.slice(1)}-mobile-${info.project.name}.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await noOverflow(page); await actionsFit(page);
    await page.screenshot({ path: `.artifacts/gestao-${path.slice(1)}-200-${info.project.name}.png`, fullPage: true });
    if (path === '/conta') await page.getByRole('region', { name: 'Preferências de novidades da loja', exact: true }).screenshot({ path: `.artifacts/gestao-preferencias-200-${info.project.name}.png` });
    expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  }
});

test('erro do contador global mantém lista consultável e oferece repetição sem inventar zero', async ({ page }) => {
  let failed = true;
  await mockRelationship(page, { handler: async (route, url) => {
    if (url.pathname !== '/api/notificacoes/grupos' || url.searchParams.get('pageSize') !== '1' || !failed) return false;
    await json(route, { code: 'temporarily_unavailable', message: 'Contador indisponível.' }, 503); return true;
  } });
  await page.goto('/notificacoes');
  await expect(page.getByRole('button', { name: 'Abrir novidade', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Consultar contador novamente', exact: true })).toBeVisible();
  await expect(page.getByText('0 grupos pedem sua atenção.', { exact: true })).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Consultar contador novamente', exact: true }).click();
  await expect(page.getByText('1 grupo pede sua atenção.', { exact: true })).toBeVisible();
  failed = true; await refresh(page);
  await expect(page.getByText('Em todas as suas lojas · última consulta', { exact: true })).toBeVisible();
  await expect(page.getByText('1 grupo pede sua atenção.', { exact: true })).toBeVisible();
});

test('perfil reconcilia resposta perdida e preserva o nome ao reconsultar preferências', async ({ page }) => {
  let saved = '';
  await mockRelationship(page, { handler: async (route, url) => {
    if (url.pathname !== '/api/perfil') return false;
    if (route.request().method() === 'PATCH') {
      saved = route.request().postDataJSON().displayName as string;
      await json(route, { code: 'temporarily_unavailable', message: 'Resposta perdida.' }, 503); return true;
    }
    if (!saved) return false;
    await json(route, { id: ids.ana, email: 'ana@example.test', displayName: saved }); return true;
  } });
  await page.goto('/conta');
  const name = page.getByLabel('Seu nome', { exact: true });
  await name.fill('Ana e seus mimos');
  await page.getByRole('button', { name: 'Salvar nome', exact: true }).click();
  await expect(page.getByText('Seu nome foi salvo.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Loja das preferências', exact: true }).selectOption(ids.first);
  await page.getByText('Reações e comentários continuam no histórico, sem chamar atenção no contador.', { exact: true }).click();
  await expect(page.getByLabel('Silenciar interações desta loja', { exact: true })).toBeChecked();
  await refresh(page); await expect(name).toHaveValue('Ana e seus mimos');
});
