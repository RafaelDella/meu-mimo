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
    await use(); expect(errors).toEqual([]);
    expect(services, 'A prévia deve permanecer isolada dos serviços reais.').toEqual([]);
  }, { auto: true }],
});
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const file = (name: string, bytes = pixel) => ({ name, mimeType: 'image/png', buffer: bytes });
const row = (page: Page, name: string) => page.getByRole('listitem', { name, exact: true });
async function open(page: Page) {
  await page.goto('/visual-check/midia');
  await expect(page.getByText('Ainda não há arquivos neste item.', { exact: true })).toBeVisible();
}
async function choose(page: Page, payload: ReturnType<typeof file>) {
  await page.getByLabel('Escolher arquivos da galeria', { exact: true }).setInputFiles(payload);
}
async function send(page: Page) { await page.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true }).click(); }
async function discard(page: Page, name: string) {
  await row(page, name).getByRole('button', { name: 'Remover arquivo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Descartar arquivo?', exact: true });
  const feedback = page.getByText('Arquivo removido.', { exact: true }).or(page.getByRole('alert')
    .filter({ hasText: 'O acesso a estes arquivos não está disponível.' }));
  // A regressão de remoção também é exercitada contra o build anterior ao
  // diálogo. A confirmação tem uma asserção explícita no cenário READY abaixo.
  await expect(dialog.or(feedback)).toBeVisible();
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Confirmar remoção', exact: true }).click();
}

test('cancelar depois de 429 sem arquivo reservado mantém coleção e outro item autorizado', async ({ page }) => {
  await open(page); await choose(page, file('arquivo-preservado.png')); await send(page);
  await expect(row(page, 'arquivo-preservado.png')).toContainText('Recebido. Preparando');
  await page.getByRole('button', { name: 'Simular limite 429', exact: true }).click();
  await choose(page, file('selecao-nao-reservada.png')); await send(page);
  await expect(row(page, 'selecao-nao-reservada.png')).toContainText('Aguarde antes de retomar');
  await discard(page, 'selecao-nao-reservada.png');
  await expect(row(page, 'selecao-nao-reservada.png')).toHaveCount(0);
  await expect(row(page, 'arquivo-preservado.png')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher da galeria', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert').filter({ hasText: 'O acesso a estes arquivos não está disponível.' })).toHaveCount(0);
  await expect(page.getByText(/Reservas fictícias: 1. Partes fictícias: 1/)).toBeVisible();
});

test('cancelar tentativa com resposta perdida remove o arquivo que chegou a ser reservado', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Perder resposta da reserva', exact: true }).click();
  await choose(page, file('resposta-perdida.png')); await send(page);
  await expect(row(page, 'resposta-perdida.png')).toContainText('A resposta da reserva se perdeu');
  await discard(page, 'resposta-perdida.png');
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remontar componente de exemplo', exact: true }).click();
  await expect(page.getByText('Ainda não há arquivos neste item.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Reservas fictícias: 1. Partes fictícias: 0/)).toBeVisible();
});

test('cancelar tentativa ausente após revogação continua negando a coleção inteira', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Simular limite 429', exact: true }).click();
  await choose(page, file('tentativa-revogada.png')); await send(page);
  await expect(row(page, 'tentativa-revogada.png')).toContainText('Aguarde antes de retomar');
  await page.getByRole('button', { name: 'Negar consulta de exemplo', exact: true }).click();
  await discard(page, 'tentativa-revogada.png');
  await expect(page.getByRole('alert').filter({ hasText: 'O acesso a estes arquivos não está disponível.' })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Escolher da galeria', exact: true })).toHaveCount(0);
});

test('retomada recusa bytes diferentes com mesmo tamanho e MIME antes de enviar novas partes', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Perder resposta de uma parte', exact: true }).click();
  const original = file('original-ficticio.png', Buffer.alloc(6 * 1024 * 1024, 1));
  await choose(page, original); await send(page);
  await expect(row(page, original.name)).toContainText('Uma parte foi recebida');
  await page.getByRole('button', { name: 'Remontar componente de exemplo', exact: true }).click();
  const recovered = row(page, 'Foto enviada');
  await expect(recovered).toContainText('83% confirmado');
  const wrong = file('bytes-diferentes.png', Buffer.alloc(original.buffer.length, 2));
  await recovered.getByLabel('Arquivo original para retomar', { exact: true }).setInputFiles(wrong);
  await row(page, wrong.name).getByRole('button', { name: 'Retomar arquivo', exact: true }).click();
  await expect(row(page, wrong.name).getByRole('alert').filter({ hasText: 'Escolha o mesmo arquivo da primeira tentativa.' })).toBeVisible();
  await expect(row(page, wrong.name)).toContainText('83% confirmado');
  await expect(page.getByText(/Reservas fictícias: 1. Partes fictícias: 1. Offsets confirmados: 0/)).toBeVisible();
  await row(page, wrong.name).getByLabel('Arquivo original para retomar', { exact: true }).setInputFiles(original);
  await row(page, original.name).getByRole('button', { name: 'Retomar arquivo', exact: true }).click();
  await expect(row(page, original.name)).toContainText('Recebido. Preparando');
  await expect(page.getByText(/Reservas fictícias: 1. Partes fictícias: 2. Offsets confirmados: 0, 5242880/)).toBeVisible();
});

test('descartar mídia pronta exige confirmação e cancelar ou Escape preserva arquivo e foco', async ({ page }) => {
  await open(page); await choose(page, file('pronto-para-consulta.png')); await send(page);
  await page.getByRole('button', { name: 'Processar itens fictícios', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
  const item = row(page, 'pronto-para-consulta.png');
  await expect(item).toContainText('Pronto para consulta privada.');
  const remove = item.getByRole('button', { name: 'Remover arquivo', exact: true });
  await remove.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Descartar arquivo?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('pronto-para-consulta.png');
  await dialog.getByRole('button', { name: 'Manter arquivo', exact: true }).click();
  await expect(dialog).not.toBeVisible(); await expect(remove).toBeFocused(); await expect(item).toBeVisible();
  await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible(); await expect(remove).toBeFocused(); await expect(item).toBeVisible();
  await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar remoção', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Arquivos deste item', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Remontar componente de exemplo', exact: true }).click();
  await expect(page.getByText('Ainda não há arquivos neste item.', { exact: true })).toBeVisible();
});
