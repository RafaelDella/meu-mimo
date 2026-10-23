import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { pilotFixture, personPage, createStore, invite, createActivity, submitRecord, review,
  createReward, redeem, transition, closeContexts, fixtureFile } from './helpers';
import { waitForDomainBudget } from './helper-auth';

type Metrics = { supported: boolean; lcpMs: number | null; cls: number; lastLcpAt: number };
type LabWindow = Window & { __meumimoT14Lab?: Metrics };
type Sample = { scene: string; cache: 'cold' | 'warm'; round: number; lcpMs: number; cls: number; interactionMs: number };
type Scene = { name: string; pathname: string; ready(page: Page): Promise<void>; interact(page: Page): Promise<void>; interaction: string };

async function installMetrics(page: Page) {
  await page.addInitScript(() => {
    const metrics: Metrics = { supported: PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint') &&
      PerformanceObserver.supportedEntryTypes.includes('layout-shift'), lcpMs: null, cls: 0, lastLcpAt: 0 };
    (window as LabWindow).__meumimoT14Lab = metrics;
    if (!metrics.supported) return;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) { metrics.lcpMs = entry.startTime; metrics.lastLcpAt = performance.now(); }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    let sessionStart = 0; let lastShift = 0; let sessionValue = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (shift.hadRecentInput) continue;
        if (sessionValue && shift.startTime - lastShift < 1000 && shift.startTime - sessionStart < 5000) sessionValue += shift.value;
        else { sessionStart = shift.startTime; sessionValue = shift.value; }
        lastShift = shift.startTime; metrics.cls = Math.max(metrics.cls, sessionValue);
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function imageReady(page: Page, name: string) {
  const image = page.getByRole('img', { name, exact: true }); await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
}

async function browserInstant(page: Page) { return page.evaluate(() => performance.timeOrigin + performance.now()); }

function p75(values: number[]) {
  expect(values).toHaveLength(5);
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.75) - 1];
}

test('coleta cinco rodadas cold/warm e p75 de laboratório em build de produção', async ({ browser }) => {
  test.setTimeout(1_200_000);
  const f = await pilotFixture(); const contexts: BrowserContext[] = [];
  try {
    const ownerPerson = await f.createUser();
    const owner = await personPage(browser, ownerPerson); contexts.push(owner.context);
    const ana = await personPage(browser, await f.createUser()); contexts.push(ana.context);
    const storeId = await createStore(owner.page, f.trackStore); await invite(owner.page, ana.page, storeId);
    const activityId = await createActivity(owner.page, storeId);
    const recordId = await submitRecord(ana.page, storeId, activityId, true);
    await waitForDomainBudget(f.database, ownerPerson.id);
    await review(owner.page, storeId, recordId, 'Aprovar registro');
    await waitForDomainBudget(f.database, ownerPerson.id);
    const rewardId = await createReward(owner.page, storeId); const ticketId = await redeem(ana.page, storeId, rewardId);
    await waitForDomainBudget(f.database, ownerPerson.id);
    await transition(owner.page, storeId, ticketId, 'Marcar realização', 'Confirmar realização');
    await waitForDomainBudget(f.database, ownerPerson.id);
    await owner.page.goto(`/lojas/${storeId}/tickets/${ticketId}`);
    await owner.page.getByRole('button', { name: 'Adicionar momentos', exact: true }).click();
    const photo = await readFile(fixtureFile('photo.png'));
    for (let batch = 0; batch < 2; batch++) {
      await waitForDomainBudget(f.database, ownerPerson.id, { read: 70, write: 23 });
      await owner.page.locator('input[type=file][aria-label="Escolher arquivos da galeria"]').setInputFiles(
        Array.from({ length: 10 }, (_, index) => ({ name: `laboratorio-${batch * 10 + index + 1}.png`, mimeType: 'image/png', buffer: photo })));
      await owner.page.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true }).click();
      const expectedAssets = (batch + 1) * 10;
      // O worker real prepara o lote; o SELECT observa somente a coleção desta fixture.
      await expect.poll(async () => (await f.database.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE m.state='READY' AND m."displayBytes">0 AND m."thumbnailBytes">0)::int AS ready
        FROM app."MediaAsset" m JOIN app."TicketAlbum" a ON a."collectionId"=m."collectionId"
        WHERE a."redemptionId"=$1 AND a."createdByProfileId"=$2 AND m."authorProfileId"=$2
          AND a."storeId"=$3 AND m."removedAt" IS NULL`, [ticketId, ownerPerson.id, storeId])).rows[0],
      { timeout: 90_000, intervals: [500, 1000, 2000], message: `Aguardar os ${expectedAssets} arquivos reais prontos no próprio álbum.` })
        .toEqual({ total: expectedAssets, ready: expectedAssets });
      // Um refresh remonta as miniaturas; reservar a cota real antes dessa leitura.
      await waitForDomainBudget(f.database, ownerPerson.id, { read: 100, write: 2 });
      await owner.page.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
      await expect(owner.page.getByRole('checkbox', { name: /Selecionar momento \d+ para publicar/ })).toHaveCount(10);
      for (let index = 0; index < 10; index++) {
        await owner.page.getByRole('checkbox', { name: `Selecionar momento ${index + 1} para publicar`, exact: true }).check();
        await owner.page.getByLabel(`Legenda do momento ${index + 1}`, { exact: true }).fill(`Foto laboratório ${batch * 10 + index + 1}`);
      }
      // A confirmação pela UI recarrega os arquivos e as miniaturas publicadas.
      await waitForDomainBudget(f.database, ownerPerson.id, { read: 80, write: 2 });
      await owner.page.getByRole('button', { name: 'Publicar 10 momentos prontos', exact: true }).click();
      await owner.page.getByRole('dialog').getByRole('button', { name: 'Confirmar publicação', exact: true }).click();
      await expect(owner.page.getByRole('listitem', { name: /Momento publicado \d+$/ })).toHaveCount((batch + 1) * 10);
    }
    expect((await f.database.query(`SELECT count(*)::int n FROM app."AlbumItem" i JOIN app."TicketAlbum" a ON a.id=i."albumId"
      JOIN app."MediaAsset" m ON m.id=i."assetId" WHERE a."redemptionId"=$1 AND m.state='READY' AND m."displayBytes">0`, [ticketId])).rows[0].n).toBe(20);

    const page = owner.page; const issues: string[] = [];
    page.on('console', message => { if (message.type() === 'error') issues.push('console_error'); });
    page.on('pageerror', () => issues.push('page_error'));
    page.on('response', response => { if (response.status() >= 400) issues.push(`resource_http_${response.status()}`); });
    page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') issues.push('resource_network_error'); });
    await installMetrics(page);
    const client = await owner.context.newCDPSession(page);
    const profile = { cpuSlowdown: 4, latencyMs: 100, downloadBytesPerSecond: 200_000, uploadBytesPerSecond: 93_750,
      viewport: { width: 390, height: 844 }, device: 'Chromium desktop emulado, sem aparelho físico' };
    await client.send('Network.enable'); await client.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
    await client.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latencyMs,
      downloadThroughput: profile.downloadBytesPerSecond, uploadThroughput: profile.uploadBytesPerSecond });
    const scenes: Scene[] = [
      { name: 'entrada-lojas', pathname: '/lojas', interaction: 'Consultar lojas criadas',
        ready: async page => { await expect(page.getByRole('heading', { name: 'Minhas lojas', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Lojas que criei', exact: true })).toBeEnabled(); },
        interact: async page => { await page.getByRole('button', { name: 'Lojas que criei', exact: true }).click(); await expect(page.getByRole('link', { name: 'Gerenciar loja', exact: true })).toBeVisible(); } },
      { name: 'lojinha', pathname: `/lojas/${storeId}`, interaction: 'Abrir mural real',
        ready: async page => { await expect(page.getByRole('heading', { name: 'Resumo da sua loja', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Registros para cuidar', exact: true })).toBeVisible(); },
        interact: async page => { await page.getByRole('link', { name: 'Mural', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Mural da relação', exact: true })).toBeVisible(); } },
      { name: 'analise-com-foto', pathname: `/lojas/${storeId}/registros/${recordId}`, interaction: 'Abrir bytes privados da evidência',
        ready: async page => { await expect(page.getByRole('button', { name: 'Abrir arquivo', exact: true })).toBeEnabled(); },
        interact: async page => { await page.getByRole('button', { name: 'Abrir arquivo', exact: true }).click(); await imageReady(page, 'Foto privada deste item'); } },
      { name: 'catalogo', pathname: `/lojas/${storeId}/mimos`, interaction: 'Abrir mimo persistido',
        ready: async page => { await expect(page.getByRole('heading', { name: 'Catálogo de mimos', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: /^Gerenciar mimo\b/ })).toBeVisible(); },
        interact: async page => { await page.getByRole('link', { name: /^Gerenciar mimo\b/ }).click(); await expect(page.getByRole('link', { name: 'Editar mimo', exact: true })).toBeVisible(); } },
      { name: 'ticket-album-20', pathname: `/lojas/${storeId}/tickets/${ticketId}`, interaction: 'Abrir foto privada no álbum de vinte itens',
        ready: async page => { await expect(page.getByRole('listitem', { name: /Momento publicado \d+$/ })).toHaveCount(20); },
        interact: async page => { await page.getByRole('button', { name: 'Abrir foto 1', exact: true }).click(); await imageReady(page, 'Foto laboratório 1'); } },
    ];
    const samples: Sample[] = [];
    for (let round = 1; round <= 5; round++) for (const scene of scenes) for (const cache of ['cold', 'warm'] as const) {
      await waitForDomainBudget(f.database, ownerPerson.id, { read: 70, write: 0 });
      await client.send('Network.setCacheDisabled', { cacheDisabled: cache === 'cold' });
      if (cache === 'cold') await client.send('Network.clearBrowserCache');
      else { await page.goto(scene.pathname); await scene.ready(page); }
      await page.goto(scene.pathname); await scene.ready(page);
      await page.waitForFunction(() => {
        const metric = (window as LabWindow).__meumimoT14Lab;
        return metric?.supported && metric.lcpMs !== null && performance.now() - metric.lastLcpAt > 500;
      });
      const metrics = await page.evaluate(() => (window as LabWindow).__meumimoT14Lab);
      expect(metrics?.supported).toBe(true); expect(metrics?.lcpMs).toBeGreaterThan(0);
      expect(Number.isFinite(metrics?.lcpMs)).toBe(true); expect(Number.isFinite(metrics?.cls)).toBe(true);
      const started = await browserInstant(page); await scene.interact(page);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const interactionMs = await browserInstant(page) - started;
      expect(Number.isFinite(interactionMs)).toBe(true); expect(interactionMs).toBeGreaterThan(0); expect(issues).toEqual([]);
      samples.push({ scene: scene.name, cache, round, lcpMs: metrics!.lcpMs!, cls: metrics!.cls, interactionMs });
    }
    const aggregates = scenes.flatMap(scene => (['cold', 'warm'] as const).map(cache => {
      const values = samples.filter(sample => sample.scene === scene.name && sample.cache === cache);
      return { scene: scene.name, cache, interaction: scene.interaction, samples: values.length,
        p75LAB: { lcpMs: p75(values.map(value => value.lcpMs)), cls: p75(values.map(value => value.cls)), interactionMs: p75(values.map(value => value.interactionMs)) } };
    }));
    expect(samples).toHaveLength(50); expect(issues).toEqual([]);
    const directory = path.resolve('../.artifacts/t14-runtime/reports'); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `performance-lab-${randomUUID()}.json`), JSON.stringify({
      classification: 'LABORATORIO_LOCAL', capturedAt: new Date().toISOString(), browser: browser.version(), profile,
      host: { platform: process.platform, architecture: process.arch, node: process.versions.node,
        cpuModel: cpus()[0]?.model ?? 'indisponível', logicalCpus: cpus().length, memoryBytes: totalmem() },
      method: 'Cinco amostras por cenário/cache; p75 LAB por nearest rank. Cache cold limpa/desabilita HTTP; warm tem navegação prévia. APIs privadas continuam no-store. CLS usa maior janela de sessão, sem shifts após input recente. Pausas entre amostras preservam cotas reais e ficam fora da latência medida.',
      referenceGoals: { lcpMs: 2500, cls: 0.1, classification: 'Metas referenciais; comparar apenas com laboratório identificado.' },
      limitations: ['Latência de clique até conteúdo/paint confirmado; não é INP.', 'Não mede p75 de tráfego real nem homologa aparelho físico.', 'Sem alegação de restore Docker ou disponibilidade contínua.'],
      aggregates, samples, resourceErrors: issues,
    }, null, 2), { mode: 0o600 });
    await client.detach();
  } finally { await closeContexts(contexts); await f.cleanup(); }
});
