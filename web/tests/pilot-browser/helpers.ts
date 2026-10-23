import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Person = { id: string; email: string; password: string };
type Fixture = {
  database: Pool; auth: SupabaseClient;
  environment: { origin: string; supabaseURL: string; mailURL: string };
  createUser: () => Promise<Person>; trackStore: (id: string) => void; trackEmail: (email: string) => void;
  trackRateKey: (key: string) => void;
};
export async function pilotFixture() {
  const cleanup: Array<() => Promise<void>> = [];
  // Reuse the existing scoped fixture cleanup; this module is not shipped to the browser.
  const fixtureHelper = await import(new URL('../integration/helpers/fixtures.mjs', import.meta.url).href);
  const fixture = await fixtureHelper.createFixture({ after: (fn: () => Promise<void>) => cleanup.push(fn) }) as Fixture;
  return { ...fixture, cleanup: async () => { for (const fn of cleanup) await fn(); } };
}
export async function login(page: Page, person: Person) {
  await page.goto('/conta');
  await page.getByLabel('E-mail', { exact: true }).fill(person.email);
  await page.getByLabel('Senha', { exact: true }).fill(person.password);
  await page.locator('form').getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Você está na sua conta', { exact: true })).toBeVisible();
}
export async function personPage(browser: Browser, person: Person) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4310', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await login(page, person); return { page, context };
}
export const fixtureFile = (name: string) => path.resolve(`../.artifacts/t14-runtime/fixtures/${name}`);
export function idFrom(page: Page, segment: string) {
  const id = new URL(page.url()).pathname.split(`/${segment}/`)[1]?.split('/')[0];
  expect(id).toMatch(/^[a-f0-9-]{36}$/); if (!id) throw new Error('URL não identificou o recurso confirmado.'); return id;
}
export async function createStore(page: Page, track: (id: string) => void) {
  await page.goto('/lojas/nova');
  await page.getByLabel('Nome da loja', { exact: true }).fill(`QA web real ${randomUUID().slice(0, 8)}`);
  await page.getByLabel('Apresentação', { exact: true }).fill('Relação sintética do aceite local.');
  await page.getByRole('button', { name: 'Criar lojinha', exact: true }).click();
  await expect(page).toHaveURL(/\/lojas\/[a-f0-9-]{36}$/);
  const storeId = idFrom(page, 'lojas'); track(storeId); return storeId;
}
export async function invite(owner: Page, person: Page, storeId: string) {
  await owner.goto(`/lojas/${storeId}/convites`);
  await owner.getByRole('button', { name: 'Gerar convite', exact: true }).click();
  const link = await owner.getByLabel('Link do convite', { exact: true }).inputValue();
  await person.goto(link); await person.getByRole('button', { name: 'Aceitar convite', exact: true }).click();
  await expect(person).toHaveURL(`/lojas/${storeId}`);
}
export async function createActivity(owner: Page, storeId: string, points = 15) {
  await owner.goto(`/lojas/${storeId}/atividades/nova`);
  await owner.getByLabel('Nome da atividade', { exact: true }).fill(`Conquista web ${randomUUID().slice(0, 6)}`);
  await owner.getByLabel('Pontos por conquista aprovada', { exact: true }).fill(String(points));
  await owner.getByRole('combobox', { name: /^Frequência/ }).selectOption('WEEKLY');
  await owner.getByLabel('Registros por semana', { exact: true }).fill('100');
  await owner.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(owner).toHaveURL(/\/atividades\/[a-f0-9-]{36}$/);
  return idFrom(owner, 'atividades');
}
export async function submitRecord(page: Page, storeId: string, activityId: string, photo = false) {
  await page.goto(`/lojas/${storeId}/atividades/${activityId}/registrar`);
  await page.getByLabel('Legenda (opcional)', { exact: true }).fill('Conquista enviada pelo navegador real.');
  if (photo) {
    await page.locator('input[type=file][aria-label="Escolher arquivos da galeria"]').setInputFiles(fixtureFile('photo-gps-orientation.jpg'));
    await page.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true }).click();
    await expect(async () => {
      await page.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeEnabled();
    }).toPass({ timeout: 30_000, intervals: [1000] });
  }
  await page.getByRole('button', { name: 'Enviar registro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Envio confirmado', exact: true })).toBeVisible();
  const href = await page.getByRole('link', { name: 'Abrir conquista confirmada', exact: true }).getAttribute('href');
  expect(href).toMatch(/\/registros\/[a-f0-9-]{36}$/); return href!.split('/').slice(-1)[0];
}
export async function review(owner: Page, storeId: string, recordId: string, action: 'Aprovar registro' | 'Anular registro' | 'Contestar registro' | 'Reabrir análise') {
  await owner.goto(`/lojas/${storeId}/registros/${recordId}`);
  await owner.getByRole('button', { name: action, exact: true }).click();
  const dialog = owner.getByRole('dialog');
  if (action !== 'Aprovar registro') await dialog.getByLabel('Motivo da decisão', { exact: true }).fill('Decisão sintética do aceite integrado.');
  await dialog.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(dialog).toBeHidden();
}
export async function createReward(owner: Page, storeId: string) {
  await owner.goto(`/lojas/${storeId}/mimos/novo`);
  await owner.getByLabel('Nome do mimo', { exact: true }).fill(`Café do aceite ${randomUUID().slice(0, 6)}`);
  await owner.getByLabel('Custo em pontos', { exact: true }).fill('10');
  await owner.getByLabel('Estoque ilimitado', { exact: true }).uncheck();
  await owner.getByLabel('Quantidade disponível agora', { exact: true }).fill('3');
  await owner.getByRole('button', { name: 'Salvar mimo', exact: true }).click();
  await expect(owner).toHaveURL(/\/mimos\/[a-f0-9-]{36}$/); return idFrom(owner, 'mimos');
}
export async function redeem(page: Page, storeId: string, rewardId: string) {
  await page.goto(`/lojas/${storeId}/mimos/${rewardId}`);
  await page.getByRole('button', { name: 'Resgatar mimo', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar e resgatar', exact: true }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-f0-9-]{36}$/); return idFrom(page, 'tickets');
}
export async function transition(page: Page, storeId: string, ticketId: string, action: string, confirm: string, label?: string, text = 'Decisão do aceite web.') {
  await page.goto(`/lojas/${storeId}/tickets/${ticketId}`);
  await page.getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (label) await dialog.getByLabel(label, { exact: true }).fill(text);
  await dialog.getByRole('button', { name: confirm, exact: true }).click();
  await expect(dialog).toBeHidden();
}
export async function closeContexts(contexts: BrowserContext[]) {
  // Playwright may have already closed these contexts after a test timeout.
  // A repeated close must not prevent the fixture's scoped DB/Auth cleanup.
  await Promise.allSettled(contexts.map(context => context.close()));
}
