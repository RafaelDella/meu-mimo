import { expect, test as base } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const test = base.extend<{ previewHealth: void }>({
  previewHealth: [async ({ page }, use) => {
    const errors: string[] = [];
    const services: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', request => {
      const url = new URL(request.url());
      if (!['http:', 'https:'].includes(url.protocol)) return;
      const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
      const dataPath = /^\/(auth|rest|storage|realtime)\/v1(?:\/|$)/;
      if (!localHost || dataPath.test(url.pathname) ||
          ['54321', '54322'].includes(url.port) || request.method() !== 'GET') {
        services.push(`${request.method()} ${url.origin}${url.pathname}`);
      }
    });
    await use();
    expect(errors, 'A prévia deve funcionar sem erros de navegador.').toEqual([]);
    expect(services, 'As composições e fontes devem funcionar sem serviços externos.').toEqual([]);
  }, { auto: true }],
});

async function openPreview(page: Page) {
  const response = await page.goto('/visual-check');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Um carinho em cada conquista');
  await page.evaluate(() => document.fonts.ready);
}

async function expectNoOverflow(page: Page, dialog?: Locator) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.content, 'A página não deve exigir rolagem horizontal.').toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
  if (dialog) {
    const size = await dialog.evaluate(element => ({
      content: element.scrollWidth, available: element.clientWidth,
      left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
    }));
    expect(size.content, 'O conteúdo do diálogo deve caber na largura útil.').toBeLessThanOrEqual(
      size.available + 1,
    );
    expect(size.left).toBeGreaterThanOrEqual(-1);
    expect(size.right).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
}

async function expectActionFits(action: Locator) {
  const dimensions = await action.boundingBox();
  expect(dimensions).not.toBeNull();
  expect(dimensions!.width, 'O alvo deve ter pelo menos 44 px de largura.').toBeGreaterThanOrEqual(44);
  expect(dimensions!.height, 'O alvo deve ter pelo menos 44 px de altura.').toBeGreaterThanOrEqual(44);
  const textFits = await action.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.textContent?.trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        if (Array.from(range.getClientRects()).some(rect =>
          rect.left < bounds.left - 1 || rect.right > bounds.right + 1 ||
          rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)) return false;
      }
      node = walker.nextNode();
    }
    return true;
  });
  expect(textFits, 'O rótulo completo deve caber dentro do alvo de interação.').toBe(true);
}

async function expectVisibleActionsFit(page: Page) {
  const actions = page.getByRole('button').or(page.getByRole('link'));
  for (const action of await actions.all()) {
    if (/pular/i.test(await action.innerText())) continue;
    if (await action.isVisible()) await expectActionFits(action);
  }
}

async function expectVisibleFocus(control: Locator) {
  expect(await control.evaluate(element => {
    const style = getComputedStyle(element);
    return element.matches(':focus-visible') &&
      ((style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) ||
        style.boxShadow !== 'none');
  }), 'A navegação por teclado precisa mostrar o foco.').toBe(true);
}

test('apresenta as três composições fictícias com saldos e ordem de leitura distintos', async ({ page }) => {
  await openPreview(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByText('Prévia visual · Dados fictícios', { exact: true })).toBeVisible();
  const available = page.locator('.ui-points-available');
  const pending = page.locator('.ui-points-pending');
  await expect(available).toContainText('Disponíveis');
  await expect(available.getByRole('definition')).toHaveText('90 pontos');
  await expect(available).not.toContainText('Em análise');
  await expect(pending).toContainText('Em análise');
  await expect(pending.getByRole('definition')).toHaveText('15 pontos');
  await expect(page.getByText('Nenhum momento por aqui ainda', { exact: true })).toBeVisible();
  const readingOrder = await page.getByRole('main').ariaSnapshot();
  const headings = ['Um carinho em cada conquista', 'Sua lojinha', 'Um mimo de pertinho',
    'Cantinho do lojista'].map(title => readingOrder.indexOf(title));
  expect(headings.every(position => position >= 0)).toBe(true);
  expect(headings).toEqual([...headings].sort((left, right) => left - right));
  await expectNoOverflow(page);
  await expectVisibleActionsFit(page);
  await page.screenshot({ path: test.info().outputPath('ui-foundation.png'), fullPage: true });
});

test('abre por teclado, contém o foco e o devolve ao fechar ou pressionar Escape', async ({ page }) => {
  await openPreview(page);
  const trigger = page.getByRole('button', { name: 'Ver café da manhã', exact: true });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await trigger.evaluate(element => element === document.activeElement)) break;
  }
  await expect(trigger).toBeFocused();
  await expectVisibleFocus(trigger);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Café da manhã na cama', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/\S/);
  await expect(dialog.getByText('Faltam 30 pontos para este mimo.', { exact: true })).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Tab']) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate(element => element.contains(document.activeElement)),
      'O foco deve permanecer no diálogo aberto.').toBe(true);
  }
  await expectNoOverflow(page, dialog);
  await expectActionFits(dialog.getByRole('button', { name: 'Fechar', exact: true }));
  await page.screenshot({ path: test.info().outputPath('ui-dialog.png') });
  const close = dialog.getByRole('button', { name: 'Fechar', exact: true });
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('mostra o ticket como prévia sem descontar ou persistir pontos', async ({ page }) => {
  await openPreview(page);
  const before = await page.evaluate(() => ({
    local: { ...localStorage }, session: { ...sessionStorage },
  }));
  const trigger = page.getByRole('button', { name: 'Ver vale-louça', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Vale-louça', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Prévia de ticket', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Nenhum ponto será descontado nesta prévia.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.ui-points-available').getByRole('definition')).toHaveText('90 pontos');
  await expect(page.locator('.ui-points-pending').getByRole('definition')).toHaveText('15 pontos');
  expect(await page.evaluate(() => ({
    local: { ...localStorage }, session: { ...sessionStorage },
  }))).toEqual(before);
});

test('associa rótulo, orientação e erro do campo e permite corrigir o exemplo', async ({ page }) => {
  await openPreview(page);
  const field = page.getByRole('textbox', { name: 'Nome do mimo', exact: true });
  await expect(field).toHaveValue('');
  await expect(field).toHaveAccessibleDescription(/\S/);
  const describedIds = (await field.getAttribute('aria-describedby'))?.split(/\s+/) ?? [];
  expect(describedIds.length).toBeGreaterThan(0);
  for (const id of describedIds) {
    expect(await page.evaluate(value => document.getElementById(value)?.textContent?.trim(), id)).toBeTruthy();
  }
  const errorAnnouncement = page.locator('.ui-field-error');
  await expect(errorAnnouncement).toHaveAttribute('aria-live', 'polite');
  await expect(errorAnnouncement).toBeEmpty();
  await field.focus();
  await page.keyboard.press('Enter');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Escreva o nome do mimo.', { exact: true })).toBeVisible();
  await expect(field).toHaveAccessibleDescription(/Escreva o nome do mimo\./);
  await expect(errorAnnouncement).toHaveText('Escreva o nome do mimo.');
  await page.screenshot({ path: test.info().outputPath('ui-field-error.png'), fullPage: true });
  await field.fill('Uma tarde juntinhos');
  await page.getByRole('button', { name: 'Conferir exemplo', exact: true }).click();
  await expect(page.getByText('Escreva o nome do mimo.', { exact: true })).not.toBeVisible();
  expect(await field.getAttribute('aria-invalid')).not.toBe('true');
});

test('permite texto 200% sem cortar ações, saldos ou o diálogo', async ({ page }) => {
  await openPreview(page);
  const originalSize = await page.locator('body').evaluate(element =>
    Number.parseFloat(getComputedStyle(element).fontSize));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const enlargedSize = await page.locator('body').evaluate(element =>
    Number.parseFloat(getComputedStyle(element).fontSize));
  expect(enlargedSize).toBeGreaterThanOrEqual(originalSize * 1.99);
  await expectNoOverflow(page);
  await expectVisibleActionsFit(page);
  await expect(page.locator('.ui-points-available').getByRole('definition')).toHaveText('90 pontos');
  await expect(page.locator('.ui-points-pending').getByRole('definition')).toHaveText('15 pontos');
  await page.screenshot({ path: test.info().outputPath('ui-text-200.png'), fullPage: true });
  await page.getByRole('button', { name: 'Ver café da manhã', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Café da manhã na cama', exact: true });
  await expect(dialog).toBeVisible();
  await expectNoOverflow(page, dialog);
  await expectVisibleActionsFit(page);
  const message = dialog.getByText('Faltam 30 pontos para este mimo.', { exact: true });
  await message.scrollIntoViewIfNeeded();
  await expect(message).toBeInViewport();
  const close = dialog.getByRole('button', { name: 'Fechar', exact: true });
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('ui-dialog-text-200.png') });
  await close.click();
  await expect(dialog).not.toBeVisible();
});

test('mantém leitura e controles no desktop e respeita movimento reduzido', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPreview(page);
  await expectNoOverflow(page);
  await expectVisibleActionsFit(page);
  await page.getByRole('button', { name: 'Ver café da manhã', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Café da manhã na cama', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .filter(animation => animation.playState === 'running' || animation.pending).length)).toBe(0);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: test.info().outputPath('ui-desktop.png'), fullPage: true });
});
