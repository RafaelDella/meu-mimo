import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectionId, now } from '../activities/helpers';
import { json } from '../stores/helpers';
import { mockReview, originPath, photo, test } from './helpers';

function assetId(revision: number) { return `d1111111-1111-4111-8111-${String(revision).padStart(12, '0')}`; }
async function manyEvidenceVersions(page: Page) {
  const requestedPages: number[] = [];
  const { state } = await mockReview(page, { merchant: false, status: 'CONTESTED', handler: async (route, url, current) => {
    if (!url.pathname.endsWith(`/midia/${collectionId}`) || route.request().method() !== 'GET') return false;
    const pageNumber = Number(url.searchParams.get('page') ?? '1'); requestedPages.push(pageNumber);
    const items = [...current.assets.values()].sort((left, right) => right.revision - left.revision);
    await json(route, { collection: { id: collectionId, storeId: current.current.storeId, purpose: 'EVIDENCE', revision: 51,
      writable: current.current.analysis!.canRespond }, items: items.slice((pageNumber - 1) * 50, pageNumber * 50),
      page: pageNumber, pageSize: 50, total: items.length });
    return true;
  } });
  state.current.analysis!.evidenceRevision = 51;
  state.current.evidenceAssetId = assetId(1);
  for (let revision = 1; revision <= 51; revision += 1) {
    state.assets.set(assetId(revision), { ...photo(assetId(revision), revision), publishedAt: revision < 51 ? now : null });
  }
  return { state, requestedPages };
}

test('51ª foto pronta permite complemento e histórico anterior carrega por página sem contaminar seleção', async ({ page }) => {
  const { state, requestedPages } = await manyEvidenceVersions(page);
  await page.goto(originPath);
  await expect(page.getByText('Versão 51 · Foto', { exact: true })).toBeVisible();
  await expect(page.getByText('Versão 1 · Foto', { exact: true })).toHaveCount(0);
  const confirm = page.getByRole('button', { name: 'Confirmar complemento', exact: true });
  await expect(confirm).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Sua resposta à contestação', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Carregar arquivos anteriores', exact: true }).click();
  await expect(page.getByText('Versão 1 · Foto', { exact: true })).toBeVisible();
  await expect(page.getByText('Versão 51 · Foto', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir arquivo', exact: true })).toHaveCount(51);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText('Complemento confirmado. O registro continua em contestação, sem mudança nos pontos.', { exact: true })).toBeVisible();
  expect(requestedPages).toContain(2);
  expect(state.bodies[0]).toMatchObject({ text: '', evidenceRevision: 51, evidenceAssetId: assetId(51) });
  expect(state.current.evidenceAssetId).toBe(assetId(1));
  expect(state.assets.get(assetId(1))!.publishedAt).toBe(now);
});

test('atualizar uma coleção com muitas versões mantém a foto atual e sua confirmação', async ({ page }) => {
  const { state, requestedPages } = await manyEvidenceVersions(page);
  await page.goto(originPath);
  await page.getByRole('button', { name: 'Carregar arquivos anteriores', exact: true }).click();
  await expect(page.getByText('Versão 1 · Foto', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
  await expect(page.getByText('Versão 51 · Foto', { exact: true })).toBeVisible();
  await expect(page.getByText('Sua foto nova está pronta para confirmação.', { exact: true })).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Confirmar complemento', exact: true }); await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText('Complemento confirmado. O registro continua em contestação, sem mudança nos pontos.', { exact: true })).toBeVisible();
  expect(requestedPages.filter(value => value === 1).length).toBeGreaterThanOrEqual(2);
  expect(state.bodies).toHaveLength(1); expect(state.bodies[0].evidenceAssetId).toBe(assetId(51));
});
