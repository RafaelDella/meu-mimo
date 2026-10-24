import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CodeInvitationCreated, CodeInvitationInput, ManagedInvitation } from '../../../src/contracts/invitations';
import type { StoreView } from '../../../src/contracts/stores';
import { actionsFit, ids, json, mockApi, noOverflow, store, test } from './helpers';

const home = `/lojas/${ids.first}`;
const base = `/api/lojas/${ids.first}`;
const invitationId = '77777777-7777-4777-8777-777777777777';
const credential: CodeInvitationCreated = { id: invitationId, kind: 'CODE', code: '7KQ9M4TX2P', url: '/convites/link-ficticio',
  expiresAt: '2099-10-29T15:00:00Z', revokedAt: null, maxUses: 10, useCount: 2, status: 'PENDING' };
type Options = { listFailed?: boolean; saveMode?: 'ok' | 'reject' | 'lost'; transitionFailed?: boolean; empty?: boolean; many?: boolean; storeOverrides?: Partial<StoreView>; beforeReveal?: () => Promise<void> };

async function mockManagement(page: Page, options: Options = {}) {
  const code = { ...credential }; const { url: _url, code: _code, ...listed } = code; void _url; void _code;
  const records = { creations: [] as CodeInvitationInput[], patches: [] as Record<string, string>[], transitions: [] as string[], revelations: 0,
    invitations: options.empty ? [] : [listed, { id: '88888888-8888-4888-8888-888888888888', expiresAt: '2099-10-29T15:00:00Z', revokedAt: null, acceptedAt: null }] as ManagedInvitation[] };
  if (options.many) records.invitations = Array.from({ length: 21 }, (_, index) => ({ ...listed, id: `${String(index + 1).padStart(8, '0')}-7777-4777-8777-777777777777` }));
  const state = await mockApi(page, async (route, requestUrl, current) => {
    const path = requestUrl.pathname; const method = route.request().method();
    if (path === base && method === 'PATCH') {
      const fields = route.request().postDataJSON() as Record<string, string>; records.patches.push(fields);
      if (options.saveMode !== 'reject') current.stores[0] = { ...current.stores[0], ...fields };
      if (options.saveMode === 'reject' || options.saveMode === 'lost') await json(route, { code: 'unavailable', message: 'Não foi possível salvar. Confira e tente novamente.' }, 503);
      else await json(route, current.stores[0]); return true;
    }
    if (path === `${base}/estado`) {
      const action = route.request().postDataJSON().action as string; records.transitions.push(action);
      if (options.transitionFailed) await json(route, { code: 'pending_submissions', message: 'Resolva os registros em análise antes de encerrar.' }, 409);
      else { current.stores[0] = { ...current.stores[0], state: action === 'pause' ? 'PAUSED' : action === 'resume' ? 'ACTIVE' : 'CLOSED' }; await json(route, current.stores[0]); }
      return true;
    }
    if (!path.startsWith(`${base}/convites`)) return false;
    if (path.endsWith('/credencial')) { records.revelations += 1; await options.beforeReveal?.(); await json(route, { id: path.split('/')[5], code: code.code, url: code.url }); }
    else if (path.endsWith('/revogar')) {
      const id = path.split('/')[5]; records.invitations = records.invitations.map(item => item.id === id ? { ...item, revokedAt: '2026-10-23T15:00:00Z', ...('kind' in item ? { status: 'REVOKED' as const } : {}) } : item);
      await json(route, records.invitations.find(item => item.id === id));
    } else if (path.endsWith('/prazo')) {
      await json(route, { timezone: current.stores[0].timezone, candidates: [{ at: '2099-10-29T15:00:00Z', offset: '-03:00' }] });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON() as CodeInvitationInput; records.creations.push(body);
      const created = { ...code, id: body.operationId, maxUses: body.maxUses, useCount: 0, expiresAt: body.expiration.kind === 'NEVER' ? null : code.expiresAt };
      records.invitations = [created, ...records.invitations]; await json(route, created, 201);
    } else if (options.listFailed) await json(route, { code: 'unavailable', message: 'Não foi possível consultar os convites.' }, 503);
    else {
      const pageNumber = Number(requestUrl.searchParams.get('page') ?? 1);
      await json(route, { items: records.invitations.slice((pageNumber - 1) * 20, pageNumber * 20), page: pageNumber, pageSize: 20, total: records.invitations.length });
    }
    return true;
  });
  state.stores = [store({ role: 'MERCHANT', ...options.storeOverrides })];
  return { state, records };
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `.artifacts/desktop-gestao-${name}.png`, fullPage: true });
  await page.screenshot({ path: `.artifacts/desktop-gestao-${name}-viewport.png` });
}

test.describe('Gestão da loja no desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('convites mantêm geração e primeira consulta na mesma tela', async ({ page }, info) => {
    await mockManagement(page); await page.goto(`${home}/convites`);
    const reveal = page.getByRole('button', { name: 'Revelar código', exact: true }).first();
    const generate = page.getByRole('button', { name: 'Gerar convite', exact: true });
    await expect(reveal).toBeVisible(); await capture(page, `convites-${info.project.name}`);
    await expect(reveal).toBeInViewport({ ratio: 1 }); await expect(generate).toBeInViewport({ ratio: 1 });
    expect((await reveal.boundingBox())!.y).toBeLessThan((await generate.boundingBox())!.y);
    await noOverflow(page);
  });

  test('configurações separam edição de dados e mudança de estado', async ({ page }, info) => {
    await mockManagement(page); await page.goto(`${home}/configuracoes`);
    const name = page.getByRole('textbox', { name: 'Nome da loja', exact: true });
    const save = page.getByRole('button', { name: 'Salvar alterações', exact: true });
    const pause = page.getByRole('button', { name: 'Pausar loja', exact: true });
    await expect(pause).toBeVisible(); await capture(page, `configuracoes-${info.project.name}`);
    await expect(save).toBeInViewport({ ratio: 1 }); await expect(pause).toBeInViewport({ ratio: 1 });
    expect((await pause.boundingBox())!.x).toBeGreaterThan((await name.boundingBox())!.x + (await name.boundingBox())!.width);
    expect(await save.evaluate(element => element.closest('section') === [...document.querySelectorAll('button')].find(button => button.textContent === 'Encerrar loja')?.closest('section'))).toBe(false);
    await noOverflow(page);
  });

  test('convite gerado aparece junto das ações sem perder a política escolhida', async ({ page }, info) => {
    const { records } = await mockManagement(page, { empty: true }); await page.goto(`${home}/convites`);
    await expect(page.getByText('Nenhum convite foi gerado ainda.', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Validade do convite', exact: true }).selectOption('NEVER');
    await page.getByRole('textbox', { name: 'Máximo de novas participações', exact: true }).fill('15');
    await page.getByRole('button', { name: 'Gerar convite', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Convite pronto para compartilhar', exact: true })).toBeFocused();
    await capture(page, `gerado-${info.project.name}`);
    await expect(page.getByRole('button', { name: 'Copiar código', exact: true })).toBeInViewport({ ratio: 1 });
    expect(records.creations[0]).toMatchObject({ kind: 'CODE', expiration: { kind: 'NEVER' }, maxUses: 15 });
    await expect(page.getByRole('textbox', { name: 'Máximo de novas participações', exact: true })).toHaveValue('15');
    await page.getByRole('button', { name: 'Ocultar convite gerado', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Convites', exact: true })).toBeFocused();
  });

  test('revelar e ocultar conservam o foco no mesmo controle', async ({ page }) => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const { records } = await mockManagement(page, { beforeReveal: () => pending }); await page.goto(`${home}/convites`);
    const card = page.getByRole('article').first(); const reveal = card.getByRole('button', { name: 'Revelar código', exact: true });
    await reveal.focus(); await page.keyboard.press('Enter');
    try {
      await expect.poll(() => records.revelations).toBe(1); await expect(reveal).toHaveAttribute('aria-disabled', 'true'); await expect(reveal).toBeFocused();
      await page.keyboard.press('Enter'); expect(records.revelations).toBe(1);
    }
    finally { release!(); }
    const hide = card.getByRole('button', { name: 'Ocultar código', exact: true }); await expect(hide).toBeFocused();
    await expect(card.getByRole('group', { name: 'Código de convite: 7KQ9M-4TX2P', exact: true })).toBeVisible();
    await page.keyboard.press('Enter'); await expect(reveal).toBeFocused();
    await expect(card.getByRole('textbox', { name: 'Link do convite', exact: true })).toHaveCount(0); expect(records.revelations).toBe(1);
  });

  test('revogação por teclado preserva confirmação, usos e retorno ao título', async ({ page }) => {
    await mockManagement(page); await page.goto(`${home}/convites`); const card = page.getByRole('article').first();
    const revoke = card.getByRole('button', { name: 'Revogar convite', exact: true }); await revoke.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Revogar este convite?', exact: true }); await expect(dialog).toHaveAccessibleDescription(/Quem já participa continua/);
    await page.keyboard.press('Escape'); await expect(revoke).toBeFocused(); await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Confirmar revogação', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Convites', exact: true })).toBeFocused();
    await expect(card.getByText('Revogado', { exact: true })).toBeVisible(); await expect(card).toContainText('2 de 10 novas participações');
  });

  test('erro de consulta de convites permite recuperar sem inventar estado vazio', async ({ page }) => {
    const options = { listFailed: true }; await mockManagement(page, options); await page.goto(`${home}/convites`);
    await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível consultar os convites.' })).toBeVisible();
    await expect(page.getByText('Nenhum convite foi gerado ainda.', { exact: true })).toHaveCount(0);
    options.listFailed = false; await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(2);
  });

  test('paginação dos convites atualiza a lista e devolve foco ao título', async ({ page }) => {
    await mockManagement(page, { many: true }); await page.goto(`${home}/convites`);
    await page.getByRole('button', { name: 'Próxima', exact: true }).click();
    await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible(); await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Convites', exact: true })).toBeFocused();
  });

  test('falha ao salvar preserva rascunho e permite corrigir e tentar novamente', async ({ page }) => {
    const options: Options = { saveMode: 'reject' }; const { records } = await mockManagement(page, options); await page.goto(`${home}/configuracoes`);
    const name = page.getByRole('textbox', { name: 'Nome da loja', exact: true }); const presentation = page.getByRole('textbox', { name: 'Apresentação', exact: true });
    await name.fill('Carinho'.repeat(11)); await presentation.fill('Um pequeno gesto. '.repeat(16).slice(0, 280));
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível salvar.' })).toBeVisible(); await expect(name).toHaveValue('Carinho'.repeat(11));
    options.saveMode = 'ok'; await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(page.getByText('As informações da loja foram salvas.', { exact: true })).toBeVisible(); expect(records.patches).toHaveLength(2);
    expect(records.patches[1]).toEqual(records.patches[0]); await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('resposta perdida ao salvar é reconciliada sem repetir a escrita', async ({ page }) => {
    const { records } = await mockManagement(page, { saveMode: 'lost' }); await page.goto(`${home}/configuracoes`);
    await page.getByRole('textbox', { name: 'Nome da loja', exact: true }).fill('Nosso cantinho atualizado');
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(page.getByText('As informações da loja foram salvas.', { exact: true })).toBeVisible(); expect(records.patches).toHaveLength(1);
  });

  test('encerramento com pendências mantém o erro no diálogo e o formulário intacto', async ({ page }) => {
    const { records } = await mockManagement(page, { transitionFailed: true }); await page.goto(`${home}/configuracoes`);
    await page.getByRole('textbox', { name: 'Nome da loja', exact: true }).fill('Rascunho da minha lojinha');
    const close = page.getByRole('button', { name: 'Encerrar loja', exact: true }); await close.click();
    const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Confirmar encerramento', exact: true }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'Resolva os registros' })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(close).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Nome da loja', exact: true })).toHaveValue('Rascunho da minha lojinha');
    expect(records.transitions).toEqual(['close']); expect(records.patches).toHaveLength(0);
  });

  test('loja encerrada mostra dados somente para consulta', async ({ page }) => {
    await mockManagement(page, { storeOverrides: { state: 'CLOSED' } }); await page.goto(`${home}/configuracoes`);
    await expect(page.getByText('A loja está encerrada. As informações permanecem disponíveis para consulta.', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Informações da loja', exact: true })).toContainText('Apresentação privada da Ana');
    await expect(page.getByRole('textbox')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Encerrar loja', exact: true })).toHaveCount(0);
  });

  test('loja pausada preserva consulta dos convites e permite retomada confirmada', async ({ page }) => {
    const { records } = await mockManagement(page, { storeOverrides: { state: 'PAUSED' } }); await page.goto(`${home}/convites`);
    await expect(page.getByRole('button', { name: 'Gerar convite', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Revelar código', exact: true })).toBeEnabled();
    await page.goto(`${home}/configuracoes`); await page.getByRole('button', { name: 'Retomar loja', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Retomar esta loja?', exact: true }); await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirmar retomada', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pausar loja', exact: true })).toBeVisible(); expect(records.transitions).toEqual(['resume']);
  });

  test('pausa da plataforma mantém histórico sem permitir gerar convite', async ({ page }) => {
    const { records } = await mockManagement(page, { storeOverrides: { platformPausedAt: '2026-10-23T15:00:00Z' } }); await page.goto(`${home}/convites`);
    await expect(page.getByText('A pausa da plataforma impede novos convites. Os convites anteriores continuam no histórico.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gerar convite', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Revelar código', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Link do convite', exact: true })).toBeVisible(); expect(records.creations).toHaveLength(0);
  });
});

test('gestão cabe no celular, texto 200% e movimento reduzido', async ({ page }, info) => {
  await mockManagement(page, { storeOverrides: { name: 'Carinho'.repeat(11), presentation: 'Um pequeno gesto. '.repeat(16).slice(0, 280) } });
  const mobile = page.viewportSize()!; await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['convites', 'configuracoes']) {
    await page.setViewportSize(mobile); await page.goto(`${home}/${path}`);
    if (path === 'convites') {
      await page.getByRole('combobox', { name: 'Validade do convite', exact: true }).selectOption('AT');
      await page.getByRole('button', { name: 'Revelar código', exact: true }).first().click();
      await expect(page.getByRole('textbox', { name: 'Link do convite', exact: true })).toBeVisible();
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await noOverflow(page); await actionsFit(page);
    const captureTarget = path === 'convites' ? page.getByRole('group', { name: 'Código de convite: 7KQ9M-4TX2P', exact: true }) : page.getByRole('heading', { name: 'Identidade e apresentação', exact: true });
    await captureTarget.evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `.artifacts/desktop-gestao-${path}-${info.project.name}-mobile-200.png` });
    for (const width of [1120, 1440]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(page); await actionsFit(page); }
  }
});
