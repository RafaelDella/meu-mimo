import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

const test = base.extend<{ previewHealth: void }>({
  previewHealth: [async ({ page }, use) => {
    const errors: string[] = [];
    const services: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) &&
        (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
          ['54321', '54322'].includes(url.port) || request.method() !== 'GET' || url.pathname.startsWith('/api/'))) {
        services.push(`${request.method()} ${url.origin}${url.pathname}`);
      }
    });
    await use();
    expect(errors).toEqual([]);
    expect(services, 'A demonstração deve usar só memória, sem API ou banco.').toEqual([]);
  }, { auto: true }],
});

async function open(page: Page) {
  await page.goto('/visual-check/conversa');
  await expect(page.getByRole('heading', { name: 'Conversa de exemplo', exact: true })).toBeVisible();
  await expect(page.getByText(/Demonstração com dados fictícios em memória/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Seu comentário', exact: true })).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    <= document.documentElement.clientWidth + 1)).toBe(true);
}

test('conversa vazia, envio com autor e texto simples preservam privacidade da prévia', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Ainda não há comentários neste item.', { exact: true })).toBeVisible();
  const text = '<img src=x onerror=alert(1)> Um carinho 🌷';
  await page.getByRole('textbox', { name: 'Seu comentário', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Comentários do item' }).getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toContainText('Ana de exemplo');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Conversa deste item', exact: true })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Seu comentário', exact: true })).toHaveValue('');
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('conversation.png'), fullPage: true });
});

test('500 pontos Unicode são contados corretamente e 501 não envia', async ({ page }) => {
  await open(page);
  const field = page.getByRole('textbox', { name: 'Seu comentário', exact: true });
  await field.fill('🌷'.repeat(501));
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Use até 500 caracteres');
  await expect(field).toBeFocused();
  await expect(page.getByText(/Comentários confirmados na demonstração: 0/)).toBeVisible();
  await field.fill('🌷'.repeat(500));
  await expect(page.getByText('500 de 500 caracteres. Use texto simples.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('listitem')).toContainText('🌷'.repeat(500));
  await noOverflow(page);
});

test('resposta perdida seguida de 429 recupera o mesmo envio sem duplicar', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Simular resposta perdida', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Seu comentário', exact: true });
  await field.fill('Um comentário confirmado uma vez.');
  await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A resposta se perdeu');
  await expect(field).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Consultar envio', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Aguarde e consulte o mesmo envio');
  await expect(field).toHaveValue('Um comentário confirmado uma vez.');
  await expect(field).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Consultar envio', exact: true }).click();
  await expect(page.getByText(/Comentários confirmados na demonstração: 1/)).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Enviar comentário', exact: true })).toBeEnabled();
});

test('troca de contexto aborta resposta atrasada e descarta texto anterior', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Simular demora no envio', exact: true }).click();
  await page.getByRole('textbox', { name: 'Seu comentário', exact: true }).fill('Texto privado do contexto anterior.');
  await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enviando…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Alternar contexto de exemplo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Seu comentário', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Liberar resposta', exact: true }).click();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.locator('body').innerText()).not.toContain('Texto privado do contexto anterior.');
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await expect(page.getByText(/Contexto: Bia de exemplo/)).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain('Texto privado do contexto anterior.');
});

test('somente consulta mantém histórico e permite recuperar envio anterior', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Simular resposta perdida', exact: true }).click();
  await page.getByRole('textbox', { name: 'Seu comentário', exact: true }).fill('Enviado antes de fechar a conversa.');
  await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar envio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alternar somente consulta', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar conversa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar envio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Consultar envio', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Aguarde e consulte');
  await page.getByRole('button', { name: 'Consultar envio', exact: true }).click();
  await expect(page.getByText('Esta conversa está somente para consulta.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Seu comentário', exact: true })).toHaveCount(0);
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('teclado, foco, texto 200% e movimento reduzido funcionam em celular', async ({ page }) => {
  await open(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const field = page.getByRole('textbox', { name: 'Seu comentário', exact: true });
  const original = await field.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await field.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(original * 1.99);
  await field.focus();
  await page.keyboard.type('Uma conversa pelo teclado.');
  expect(await field.evaluate(element => element.matches(':focus-visible') && getComputedStyle(element).outlineStyle !== 'none')).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Enviar comentário', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Conversa deste item', exact: true })).toBeFocused();
  await noOverflow(page);
  for (const button of await page.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('conversation-200.png'), fullPage: true });
});

test('fechamento entre consulta e envio é definitivo e preserva rascunho copiável', async ({ page }) => {
  await open(page);
  const field = page.getByRole('textbox', { name: 'Seu comentário', exact: true });
  await field.fill('Rascunho que ainda posso copiar.');
  await page.getByRole('button', { name: 'Alternar somente consulta', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('somente para consulta');
  await expect(page.getByRole('button', { name: 'Consultar envio', exact: true })).toHaveCount(0);
  await expect(field).toHaveValue('Rascunho que ainda posso copiar.');
  await expect(field).toBeEnabled();
  await expect(page.getByText(/Comentários confirmados na demonstração: 0/)).toBeVisible();
});

test('replay do comentário 40 após atualizar página 1 não inventa uma terceira página', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Semear 39 comentários fictícios', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar conversa', exact: true }).click();
  await expect(page.getByText('Página 1 de 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Simular resposta perdida', exact: true }).click();
  await page.getByRole('textbox', { name: 'Seu comentário', exact: true }).fill('Comentário quarenta confirmado.');
  await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar envio', exact: true })).toBeVisible();
  await expect(page.getByText(/Comentários confirmados na demonstração: 40/)).toBeVisible();
  await page.getByRole('button', { name: 'Atualizar conversa', exact: true }).click();
  await expect(page.getByText('Página 1 de 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Consultar envio', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Aguarde e consulte o mesmo envio');
  await page.getByRole('button', { name: 'Consultar envio', exact: true }).click();
  await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Comentários do item' }).getByText('Comentário quarenta confirmado.', { exact: true })).toBeVisible();
  await expect(page.getByText('Página 3 de 2', { exact: true })).toHaveCount(0);
});

for (const action of ['Próximos', 'Atualizar conversa']) {
  test(`teclado devolve foco à conversa depois de ${action.toLowerCase()}`, async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Semear 39 comentários fictícios', exact: true }).click();
    await page.getByRole('button', { name: 'Atualizar conversa', exact: true }).click();
    await expect(page.getByText('Página 1 de 2', { exact: true })).toBeVisible();
    const button = page.getByRole('button', { name: action, exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(action === 'Próximos' ? 'Página 2 de 2' : 'Página 1 de 2', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Conversa deste item', exact: true })).toBeFocused();
  });
}

test('falha de consulta depois de enviar não torna a escrita incerta nem repete POST', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Simular falha ao atualizar após envio', exact: true }).click();
  await page.getByRole('textbox', { name: 'Seu comentário', exact: true }).fill('Este comentário já foi confirmado.');
  await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Comentário enviado.' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert').filter({ hasText: 'Não foi possível atualizar a conversa.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Consultar envio', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Comentários confirmados na demonstração: 1/)).toBeVisible();
  await page.getByRole('button', { name: 'Tentar carregar novamente', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('listitem')).toContainText('Este comentário já foi confirmado.');
  await expect(page.getByRole('textbox', { name: 'Seu comentário', exact: true })).toHaveValue('');
  await expect(page.getByText(/Comentários confirmados na demonstração: 1/)).toBeVisible();
});
