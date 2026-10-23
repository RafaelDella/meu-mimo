import { expect } from '@playwright/test';
import type { ReactionBody } from '../../../src/contracts/reactions';
import { test, mockRelationship, home, feedItem, json } from './helpers';

test('cinquenta itens reaproveitam reações do mural sem GET por card nem exceder120leituras', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') });
  const { state } = await mockRelationship(page, { handler: async (route, url, current) => {
    if (url.pathname.endsWith('/mural')) {
      const items = Array.from({ length: 50 }, (_, index) => {
        const item = feedItem(current, index + 1); const conversationId = `77777777-7777-4777-8777-${String(index + 1).padStart(12, '0')}`;
        const reaction = current.reaction.conversationId === conversationId ? current.reaction : { ...current.reaction, version: 0, mine: null, reactions: [] };
        return { ...item, conversationId, reactions: { ...reaction, conversationId } };
      });
      await json(route, { items, page: 1, pageSize: 50, total: 50 }); return true;
    }
    if (url.pathname.endsWith('/reacao') && route.request().method() === 'GET') { await json(route, { ...current.reaction, conversationId: url.pathname.split('/')[5] }); return true; }
    if (url.pathname.endsWith('/reacao') && route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as ReactionBody; current.reactionBodies.push(body);
      current.reaction = { conversationId: url.pathname.split('/')[5], version: 1, mine: body.emoji, writable: true,
        reactions: body.emoji ? [{ emoji: body.emoji, author: { id: 'actor', displayName: 'Você' } }] : [] };
      await json(route, { state: current.reaction, appliedVersion: 1, event: { id: body.operationId, from: null, to: body.emoji, createdAt: '2026-10-22T12:00:00Z' } }); return true;
    }
    return false;
  } });
  await page.goto(`${home}/mural?pageSize=50`); await expect(page.getByRole('heading', { name: 'Reações deste item', exact: true })).toHaveCount(50);
  await page.waitForLoadState('networkidle'); expect(state.calls.filter(call => call.startsWith('GET ') && call.includes('/reacao'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Reagir com coração', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Reagir com coração', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Reagir com coração', exact: true }).nth(1)).toHaveAttribute('aria-pressed', 'false');
  await page.waitForLoadState('networkidle'); expect(state.reactionBodies).toHaveLength(1);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000))); await page.clock.runFor(60_000);
  expect(state.calls.filter(call => call.startsWith('GET ') && call.includes('/reacao'))).toHaveLength(0);
  expect(state.calls.filter(call => call.startsWith('GET ')).length).toBeLessThanOrEqual(120);
});

test('consulta periódica usa30segundos e não consulta aba oculta até retomar visível', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') }); const { state } = await mockRelationship(page); await page.goto(home);
  await expect(page.getByRole('heading', { name: 'Que bom ter você aqui, Ana participante', exact: true })).toBeVisible(); await page.waitForLoadState('networkidle');
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  const before = state.calls.filter(call => call.includes('/lojinha')).length;
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(60_000); expect(state.calls.filter(call => call.includes('/lojinha'))).toHaveLength(before);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => state.calls.filter(call => call.includes('/lojinha')).length).toBe(before + 1);
  await page.clock.runFor(30_000); await expect.poll(() => state.calls.filter(call => call.includes('/lojinha')).length).toBe(before + 2);
});
