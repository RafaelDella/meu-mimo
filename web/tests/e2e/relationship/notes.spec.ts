import { expect } from '@playwright/test';
import type { NoteBody } from '../../../src/contracts/notes';
import { test, mockRelationship, personPath, home, notePath, note, noteId, applyNote, json, refresh, noOverflow, actionsFit } from './helpers';

test('bilhete é conferido antes do envio e conta 2.000 caracteres Unicode', async ({ page }) => {
  const { state } = await mockRelationship(page, { merchant: true, empty: true }); await page.goto(personPath);
  const field = page.getByLabel('Texto do bilhete', { exact: true }); await field.fill('🌷'.repeat(2000));
  await expect(page.getByText('2000 de 2.000 caracteres Unicode.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conferir bilhete', exact: true }).click(); expect(state.noteBodies).toHaveLength(0);
  await expect(page.getByRole('dialog')).toContainText('🌷'.repeat(2000));
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar bilhete', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); expect(state.noteBodies).toHaveLength(1);
  expect(state.noteBodies[0].expectedVersion).toBe(0); expect(state.noteBodies[0].text).toBe('🌷'.repeat(2000));
  await expect(field).toHaveValue('🌷'.repeat(2000)); expect(state.calls.some(call => call.endsWith('/lida'))).toBe(false);
});

test('2.001 caracteres ou espaços focam o texto sem enviar', async ({ page }) => {
  const { state } = await mockRelationship(page, { merchant: true }); await page.goto(personPath);
  const field = page.getByLabel('Texto do bilhete', { exact: true }); await field.fill('🌷'.repeat(2001));
  await page.getByRole('button', { name: 'Conferir bilhete', exact: true }).click(); await expect(field).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: 'Use até 2.000' })).toBeVisible();
  await field.fill('   '); await page.getByRole('button', { name: 'Conferir bilhete', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Escreva seu bilhete' })).toBeVisible(); expect(state.noteBodies).toHaveLength(0);
});

test('cartão não lê e versão nova não substitui o painel nem recebe leitura antiga', async ({ page }) => {
  const { state } = await mockRelationship(page); await page.goto(home);
  await expect(page.getByText('Bilhete não lido', { exact: true })).toBeVisible(); expect(state.read.size).toBe(0);
  await page.getByRole('button', { name: '♡ Abrir bilhete', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Carinho privado versão 1'); await expect.poll(() => state.read.has(noteId)).toBe(true);
  state.note = note(2); state.versions.set(state.note.id, state.note); await refresh(page);
  await expect(page.getByRole('dialog')).toContainText('Há um bilhete novo');
  await expect(page.getByRole('dialog')).toContainText('Carinho privado versão 1'); expect(state.read.has(state.note.id)).toBe(false);
  await page.getByRole('button', { name: 'Abrir o bilhete novo', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Carinho privado versão 2'); await expect.poll(() => state.read.has(state.note!.id)).toBe(true);
});

test('resposta perdida usa lookup e a mesma UUID sem duplicar bilhete', async ({ page }) => {
  let lost = false;
  const { state } = await mockRelationship(page, { merchant: true, handler: async (route, url, current) => {
    if (url.pathname !== notePath || route.request().method() !== 'PATCH' || lost) return false;
    lost = true; const body = route.request().postDataJSON() as NoteBody; current.noteBodies.push(body); applyNote(current, body);
    await json(route, { code: 'temporarily_unavailable', message: 'Resposta temporariamente indisponível.' }, 503); return true;
  } });
  await page.goto(personPath); await page.getByLabel('Texto do bilhete', { exact: true }).fill('Rascunho preservado');
  await page.getByRole('button', { name: 'Conferir bilhete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar bilhete', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Consultar envio do bilhete', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Consultar envio do bilhete', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); expect(state.noteBodies).toHaveLength(1);
  expect(state.calls.some(call => call.includes(`/operacoes/${state.noteBodies[0].operationId}`))).toBe(true);
  expect(page.url()).not.toContain('Rascunho');
});

test('409 preserva rascunho e exige nova conferência com versão atual', async ({ page }) => {
  let conflict = false;
  const { state } = await mockRelationship(page, { merchant: true, handler: async (route, url, current) => {
    if (url.pathname !== notePath || route.request().method() !== 'PATCH' || conflict) return false;
    conflict = true; current.note = note(2, 'Enviado em outro dispositivo'); await json(route, { code: 'version_conflict', message: 'O bilhete mudou. Revise antes de enviar.' }, 409); return true;
  } });
  await page.goto(personPath); await page.getByLabel('Texto do bilhete', { exact: true }).fill('Meu rascunho');
  await page.getByRole('button', { name: 'Conferir bilhete', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Enviar bilhete', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(page.getByLabel('Texto do bilhete', { exact: true })).toHaveValue('Meu rascunho');
  await expect(page.getByRole('alert').filter({ hasText: 'Revise antes de enviar' })).toBeVisible();
  await expect.poll(() => state.calls.filter(call => call === `GET ${notePath}`).length).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Revisei a versão atual; usar como base', exact: true }).click();
  await page.getByRole('button', { name: 'Conferir bilhete', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Enviar bilhete', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); expect(state.noteBodies[0].expectedVersion).toBe(2);
});

test('rascunho da versão1 conserva base1 após polling trazer versão2', async ({ page }) => {
  const { state } = await mockRelationship(page, { merchant: true, handler: async (route, url, current) => {
    if (url.pathname !== notePath || route.request().method() !== 'PATCH') return false;
    const body = route.request().postDataJSON() as NoteBody; current.noteBodies.push(body);
    if (body.expectedVersion !== current.note?.version) { await json(route, { code: 'version_conflict', message: 'O bilhete mudou. Revise antes de enviar.' }, 409); return true; }
    await json(route, applyNote(current, body)); return true;
  } });
  await page.goto(personPath); const field = page.getByLabel('Texto do bilhete', { exact: true }); await field.fill('Meu rascunho baseado na versão1');
  state.note = note(2, 'Outra versão enviada no segundo dispositivo'); await refresh(page);
  await expect(page.getByText('Consultar bilhete atual · versão 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conferir bilhete', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Enviar bilhete', exact: true }).click();
  await expect.poll(() => state.noteBodies.length).toBe(1); expect(state.noteBodies[0].expectedVersion).toBe(1);
  await expect(page.getByRole('alert').filter({ hasText: 'Revise antes de enviar.' })).toBeVisible(); await expect(field).toHaveValue('Meu rascunho baseado na versão1');
});

test('bilhete privado respeita Escape, retorno de foco, 200% e movimento reduzido', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await mockRelationship(page); await page.goto(home);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const trigger = page.getByRole('button', { name: '♡ Abrir bilhete', exact: true }); await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.screenshot({ path: `.artifacts/t12-bilhete-${testInfo.project.name}.png`, fullPage: true });
  await page.keyboard.press('Tab'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(trigger).toBeFocused();
  await noOverflow(page); await actionsFit(page);
});

test('coração abre bilhete novamente depois de fechar com Escape', async ({ page }) => {
  await mockRelationship(page); await page.goto(home);
  const heart = page.getByRole('link', { name: 'Coração: abrir bilhete', exact: true }); await heart.click();
  await expect(page.getByRole('dialog')).toContainText('Carinho privado versão 1'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible(); await heart.click(); await expect(page.getByRole('dialog')).toBeVisible();
});

for (const status of [401, 403, 404]) test(`bilhete ${status} retira conteúdo privado do contexto`, async ({ page }) => {
  let denied = false; await mockRelationship(page, { handler: async (route, url) => {
    if (url.pathname.endsWith('/bilhete') && denied) { await json(route, { code: 'resource_not_found', message: 'Conteúdo indisponível.' }, status); return true; } return false;
  } });
  await page.goto(home); await page.getByRole('button', { name: '♡ Abrir bilhete', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Carinho privado versão 1'); denied = true; await refresh(page);
  await expect(page.getByText('Carinho privado versão 1', { exact: true })).not.toBeVisible();
});
