import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

const test = base.extend<{ previewHealth: void }>({
  previewHealth: [async ({ page }, use) => {
    const errors: string[] = [];
    const services: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
          ['54321', '54322', '4311'].includes(url.port) || request.method() !== 'GET' || url.pathname.startsWith('/api/'))) {
        services.push(`${request.method()} ${url.origin}${url.pathname}`);
      }
    });
    await use();
    expect(errors).toEqual([]);
    expect(services, 'A composição fictícia não deve acessar API, banco ou Storage.').toEqual([]);
  }, { auto: true }],
});
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const file = (name = 'foto-ficticia.png', size = pixel.length) => ({ name, mimeType: 'image/png', buffer: size === pixel.length ? pixel : Buffer.alloc(size, 1) });
const row = (page: Page, name = 'foto-ficticia.png') => page.getByRole('listitem', { name, exact: true });
async function open(page: Page) {
  await page.goto('/visual-check/midia');
  await expect(page.getByRole('heading', { name: 'Mídia de exemplo', exact: true })).toBeVisible();
  await expect(page.getByText(/Demonstração com arquivos fictícios em memória/)).toBeVisible();
  await expect(page.getByText('Ainda não há arquivos neste item.', { exact: true })).toBeVisible();
}
async function choose(page: Page, files = [file()]) {
  await page.getByLabel('Escolher arquivos da galeria', { exact: true }).setInputFiles(files);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    <= document.documentElement.clientWidth + 1)).toBe(true);
}
async function send(page: Page) { await page.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true }).click(); }

test('seleção, progresso e consulta são privados e aguardam processamento explícito', async ({ page }) => {
  await open(page);
  await choose(page);
  await expect(row(page)).toContainText('Ainda não foi enviado');
  await expect(page.getByRole('img')).toHaveCount(0);
  await send(page);
  await expect(row(page)).toContainText('Recebido. Preparando a mídia para consulta.');
  await expect(row(page).getByRole('progressbar')).toHaveAttribute('value', '100');
  await expect(page.getByRole('button', { name: 'Abrir arquivo', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Processar itens fictícios', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
  await expect(row(page)).toContainText('Pronto para consulta privada.');
  await row(page).getByRole('button', { name: 'Abrir arquivo', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Foto privada deste item', exact: true })).toBeVisible();
  await row(page).getByRole('button', { name: 'Fechar arquivo', exact: true }).click();
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(row(page).getByRole('button', { name: 'Abrir arquivo', exact: true })).toBeFocused();
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('media.png'), fullPage: true });
});

test('reserva com resposta perdida conserva operação e não duplica arquivo', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Perder resposta da reserva', exact: true }).click();
  await choose(page);
  await send(page);
  await expect(row(page).getByRole('alert').filter({ hasText: 'A resposta da reserva se perdeu' })).toBeVisible();
  await row(page).getByRole('button', { name: 'Retomar arquivo', exact: true }).click();
  await expect(row(page)).toContainText('Recebido. Preparando');
  await expect(page.getByText(/Reservas fictícias: 1. Partes fictícias: 1/)).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('resposta perdida após 5 MiB retoma no offset confirmado sem reenviar a parte', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Perder resposta de uma parte', exact: true }).click();
  await choose(page, [file('foto-grande-ficticia.png', 6 * 1024 * 1024)]);
  await send(page);
  await expect(row(page, 'foto-grande-ficticia.png')).toContainText('Uma parte foi recebida');
  await row(page, 'foto-grande-ficticia.png').getByRole('button', { name: 'Retomar arquivo', exact: true }).click();
  await expect(row(page, 'foto-grande-ficticia.png')).toContainText('Recebido. Preparando');
  await expect(page.getByText(/Reservas fictícias: 1. Partes fictícias: 2. Offsets confirmados: 0, 5242880/)).toBeVisible();
});

test('limite 429 tem retry explícito e mantém seleção do arquivo', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Simular limite 429', exact: true }).click();
  await choose(page);
  await send(page);
  await expect(row(page)).toContainText('Aguarde antes de retomar este arquivo.');
  await expect(page.getByText(/Reservas fictícias: 0/)).toBeVisible();
  await row(page).getByRole('button', { name: 'Retomar arquivo', exact: true }).click();
  await expect(row(page)).toContainText('Recebido. Preparando');
  await expect(page.getByText(/Reservas fictícias: 1. Partes fictícias: 1/)).toBeVisible();
});

test('lote parcial mantém erro por item e envia o próximo sem duplicar o primeiro', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Perder resposta de uma parte', exact: true }).click();
  await choose(page, [file('primeira-ficticia.png'), file('segunda-ficticia.png')]);
  await send(page);
  await expect(row(page, 'primeira-ficticia.png')).toContainText('Uma parte foi recebida');
  await expect(row(page, 'segunda-ficticia.png')).toContainText('Recebido. Preparando');
  await row(page, 'primeira-ficticia.png').getByRole('button', { name: 'Retomar arquivo', exact: true }).click();
  await expect(row(page, 'primeira-ficticia.png')).toContainText('Recebido. Preparando');
  await expect(page.getByText(/Reservas fictícias: 2. Partes fictícias: 2/)).toBeVisible();
});

test('remontar recupera upload autorizado sem reiniciar quando o original é selecionado', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Perder resposta de uma parte', exact: true }).click();
  const original = file('original-ficticio.png', 6 * 1024 * 1024);
  await choose(page, [original]);
  await send(page);
  await expect(row(page, original.name)).toContainText('Uma parte foi recebida');
  await page.getByRole('button', { name: 'Remontar componente de exemplo', exact: true }).click();
  const recovered = row(page, 'Foto enviada');
  await expect(recovered).toContainText('83% confirmado');
  await recovered.getByLabel('Arquivo original para retomar', { exact: true }).setInputFiles(original);
  await row(page, original.name).getByRole('button', { name: 'Retomar arquivo', exact: true }).click();
  await expect(row(page, original.name)).toContainText('Recebido. Preparando');
  await expect(page.getByText(/Reservas fictícias: 1. Partes fictícias: 2. Offsets confirmados: 0, 5242880/)).toBeVisible();
});

for (const action of ['Alternar coleção de exemplo', 'Trocar conta de exemplo']) {
  test(`${action.toLowerCase()} descarta arquivo privado e ignora resposta atrasada`, async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Simular demora de uma parte', exact: true }).click();
    await choose(page, [file('nome-privado-anterior.png', 6 * 1024 * 1024)]);
    await send(page);
    await expect(row(page, 'nome-privado-anterior.png').getByRole('button', { name: 'Pausar envio', exact: true })).toBeVisible();
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('listitem')).toHaveCount(0);
    await page.getByRole('button', { name: 'Liberar parte atrasada', exact: true }).click();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.locator('body').innerText()).not.toContain('nome-privado-anterior.png');
    await expect(page.getByText(/Reservas fictícias: 1. Partes fictícias: 1/)).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain('nome-privado-anterior.png');
  });
}

test('formatos e tamanhos inválidos ficam por item, limite de lote não cria reserva', async ({ page }) => {
  await open(page);
  await choose(page, [file('excesso.png', 10_000_001), { name: 'foto.heic', mimeType: 'image/heic', buffer: pixel }]);
  await expect(row(page, 'excesso.png')).toContainText('até 10 MB');
  await expect(row(page, 'foto.heic')).toContainText('HEIC não é aceito');
  await expect(page.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true })).toHaveCount(0);
  await choose(page, Array.from({ length: 11 }, (_, index) => file(`ficticio-${index}.png`)));
  await expect(page.getByRole('alert').filter({ hasText: 'Selecione até 10 arquivos por lote.' })).toBeVisible();
  await expect(page.getByText(/Reservas fictícias: 0/)).toBeVisible();
  await noOverflow(page);
});

test('câmera cancelada oferece galeria e teclado mantém foco com texto 200%', async ({ page }) => {
  await open(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const camera = page.getByRole('button', { name: 'Usar câmera', exact: true });
  await camera.focus();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles([]);
  await expect(page.getByText(/Se a câmera não abrir, for cancelada ou não tiver permissão/)).toBeVisible();
  const gallery = page.getByRole('button', { name: 'Escolher da galeria', exact: true });
  await gallery.focus();
  expect(await gallery.evaluate(element => element.matches(':focus-visible') && getComputedStyle(element).outlineStyle !== 'none')).toBe(true);
  const selection = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await selection).setFiles(file());
  const sendButton = page.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true });
  await sendButton.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Arquivos deste item', exact: true })).toBeFocused();
  await noOverflow(page);
  for (const button of await page.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('media-200.png'), fullPage: true });
});

test('consulta revogada limpa conteúdo e metadados já abertos', async ({ page }) => {
  await open(page); await choose(page); await send(page);
  await page.getByRole('button', { name: 'Processar itens fictícios', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
  await row(page).getByRole('button', { name: 'Abrir arquivo', exact: true }).click();
  await expect(page.getByRole('img')).toBeVisible();
  await page.getByRole('button', { name: 'Negar consulta de exemplo', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'O acesso a estes arquivos não está disponível.' })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('foto-ficticia.png');
});

test('consulta expirada pede acesso novo e somente consulta preserva histórico', async ({ page }) => {
  await open(page); await choose(page); await send(page);
  await page.getByRole('button', { name: 'Processar itens fictícios', exact: true }).click();
  await page.getByRole('button', { name: 'Alternar somente consulta', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
  await expect(page.getByText(/Este item está somente para consulta/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher da galeria', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Simular acesso expirado', exact: true }).click();
  await row(page).getByRole('button', { name: 'Abrir arquivo', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'O acesso temporário expirou.' })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('versão de evidência aceita só uma foto e permite remover seleção antes de substituir', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Abrir evidência fictícia', exact: true }).click();
  await expect(page.getByText('Uma foto por versão de evidência, até 10 MB. JPEG, PNG ou WebP.', { exact: true })).toBeVisible();
  await choose(page);
  await choose(page, [file('substituta-ficticia.png')]);
  await expect(page.getByRole('alert').filter({ hasText: 'Esta versão aceita uma foto.' })).toBeVisible();
  await row(page).getByRole('button', { name: 'Remover arquivo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Arquivos deste item', exact: true })).toBeFocused();
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await choose(page, [file('substituta-ficticia.png')]);
  await expect(row(page, 'substituta-ficticia.png')).toBeVisible();
});

test('fechar origem entre seleção e reserva informa consulta e não insiste no envio', async ({ page }) => {
  await open(page); await choose(page);
  await page.getByRole('button', { name: 'Alternar somente consulta', exact: true }).click();
  await send(page);
  await expect(row(page)).toContainText('Este envio de mídia está fechado.');
  await expect(page.getByText(/Este item está somente para consulta/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retomar arquivo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Arquivos deste item', exact: true })).toBeFocused();
  await expect(page.getByText(/Reservas fictícias: 0/)).toBeVisible();
});

test('pausar envio conserva reserva e retoma depois de conferir a parte já recebida', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Simular demora de uma parte', exact: true }).click();
  await choose(page, [file('pausa-ficticia.png', 6 * 1024 * 1024)]); await send(page);
  await row(page, 'pausa-ficticia.png').getByRole('button', { name: 'Pausar envio', exact: true }).click();
  await page.getByRole('button', { name: 'Liberar parte atrasada', exact: true }).click();
  await expect(row(page, 'pausa-ficticia.png')).toContainText('Envio pausado. Retome para consultar');
  await row(page, 'pausa-ficticia.png').getByRole('button', { name: 'Retomar arquivo', exact: true }).click();
  await expect(row(page, 'pausa-ficticia.png')).toContainText('Recebido. Preparando');
  await expect(page.getByText(/Reservas fictícias: 1. Partes fictícias: 2. Offsets confirmados: 0, 5242880/)).toBeVisible();
});
