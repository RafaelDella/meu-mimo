import { expect } from '@playwright/test';
import type { ReactionBody } from '../../../src/contracts/reactions';
import { test, mockRelationship, home, reactionPath, refresh, json, noOverflow } from './helpers';

test('seis reações são estados desejados e podem ser trocadas e removidas', async ({ page }) => {
  const { state } = await mockRelationship(page); await page.goto(`${home}/mural`);
  const choices = ['coração', 'palmas', 'emoção', 'fogo', 'risada', 'tulipa']; const emojis = ['❤️', '👏', '🥹', '🔥', '😂', '🌷'];
  for (let index = 0; index < choices.length; index += 1) {
    const button = page.getByRole('button', { name: `Reagir com ${choices[index]}`, exact: true }); await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true'); expect(state.reactionBodies[index].emoji).toBe(emojis[index]);
  }
  await page.getByRole('button', { name: 'Reagir com tulipa', exact: true }).click();
  await expect.poll(() => state.reactionBodies.length).toBe(7); expect(state.reactionBodies[6].emoji).toBe('🌷');
  await page.getByRole('button', { name: 'Remover minha reação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remover minha reação', exact: true })).not.toBeVisible(); expect(state.reactionBodies[state.reactionBodies.length - 1]?.emoji).toBe(null);
  expect(new Set(state.reactionBodies.map(body => body.operationId)).size).toBe(8);
});

test('reação incerta consulta UUID e repete corpo congelado se ainda não aplicado', async ({ page }) => {
  let lost = false; const captured: ReactionBody[] = [];
  const { state } = await mockRelationship(page, { handler: async (route, url) => {
    if (url.pathname !== reactionPath || route.request().method() !== 'PUT') return false;
    captured.push(route.request().postDataJSON()); if (lost) return false; lost = true;
    await json(route, { code: 'temporarily_unavailable', message: 'Não foi possível confirmar a reação.' }, 503); return true;
  } });
  await page.goto(`${home}/mural`); await page.getByRole('button', { name: 'Reagir com palmas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reagir com coração', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Consultar minha reação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reagir com palmas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(captured).toHaveLength(2); expect(captured[0]).toEqual(captured[1]); expect(state.reactionBodies).toHaveLength(1);
});

test('conversa fechada mantém reações consultáveis sem controles de escrita ativos', async ({ page }) => {
  const { state } = await mockRelationship(page); state.reaction.writable = false; state.reaction.reactions = [{ emoji: '❤️', author: { id: 'other', displayName: 'Rafa' } }];
  await page.goto(`${home}/mural`); await expect(page.getByText('❤️ · Rafa', { exact: true })).toBeVisible();
  for (const button of await page.getByRole('button', { name: /^Reagir com/ }).all()) await expect(button).toBeDisabled();
  expect(state.reactionBodies).toHaveLength(0); await noOverflow(page);
});

test('atualização de outra pessoa preserva foco e escolha atual', async ({ page }) => {
  const { state } = await mockRelationship(page); await page.goto(`${home}/mural`);
  const button = page.getByRole('button', { name: 'Reagir com emoção', exact: true }); await button.focus();
  state.reaction.reactions = [{ emoji: '🌷', author: { id: 'other', displayName: 'Rafa' } }]; await refresh(page);
  await expect(page.getByText('🌷 · Rafa', { exact: true })).toBeVisible(); await expect(button).toBeFocused();
  expect(state.reactionBodies).toHaveLength(0);
});
