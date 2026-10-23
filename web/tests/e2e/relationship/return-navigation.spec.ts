import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SubmissionView } from '../../../src/contracts/activities';
import { activity, submission } from '../activities/helpers';
import { ticket, ticketId } from '../redemptions/helpers';
import { test, mockRelationship, home, base, ids, noteId, conversationId, membershipId, now, json, feedItem } from './helpers';

function receivedSubmission(): SubmissionView {
  const current = activity(); const { name, description, category, sticker, points, frequency, weeklyLimit, approvalMode, version } = current;
  return { ...submission(current, noteId), status: 'APPROVED', pointsState: 'CREDITED', receivedAt: now, approvedAt: now,
    localDate: '2026-10-22', timezone: 'America/Sao_Paulo', occurrenceNumber: 1, review: null,
    snapshot: { name, description, category, sticker, points, frequency, weeklyLimit, approvalMode, activityVersion: version },
    conversation: { id: conversationId, storeId: ids.first, participantMembershipId: membershipId, subjectType: 'SUBMISSION', subjectId: noteId, writable: true } };
}
async function mockOrigin(page: Page, type: 'SUBMISSION' | 'TICKET') {
  const record = receivedSubmission(); const currentTicket = ticket({ status: 'FULFILLED', fulfilledAt: now });
  await mockRelationship(page, { handler: async (route, url, state) => {
    if (url.pathname === `${base}/mural`) {
      const item = type === 'SUBMISSION' ? feedItem(state) : { ...feedItem(state), subjectType: 'TICKET', subjectId: ticketId, status: 'FULFILLED', path: `${home}/tickets/${ticketId}`, conversationId: currentTicket.conversation.id };
      await json(route, { items: [item], page: 1, pageSize: 20, total: 1 }); return true;
    }
    if (url.pathname === `${base}/registros/${noteId}`) { await json(route, record); return true; }
    if (url.pathname === `${base}/registros/${noteId}/historico`) { await json(route, { items: [], page: 1, pageSize: 20, total: 0 }); return true; }
    if (url.pathname === `${base}/tickets/${ticketId}`) { await json(route, currentTicket); return true; }
    if (url.pathname === `${base}/tickets/${ticketId}/eventos`) { await json(route, { items: currentTicket.events, page: 1, pageSize: 20, total: 1 }); return true; }
    if (url.pathname === `${base}/tickets/${ticketId}/album`) {
      await json(route, { id: null, storeId: ids.first, ticketId, version: 0, collectionId: null, permissions: { canStart: false, canUpload: false, canPublish: false }, unavailableReason: null, items: [], page: 1, pageSize: 20, total: 0 }); return true;
    }
    if (url.pathname.endsWith('/comentarios') && url.pathname.includes(currentTicket.conversation.id)) { await json(route, { conversation: currentTicket.conversation, items: [], page: 1, pageSize: 20, total: 0 }); return true; }
    if (url.pathname.endsWith('/reacao') && url.pathname.includes(currentTicket.conversation.id)) { await json(route, { ...state.reaction, conversationId: currentTicket.conversation.id }); return true; }
    return false;
  } });
}
test('mural acompanha voltar e avançar do navegador sem filtros divergentes', async ({ page }) => {
  await mockRelationship(page); await page.goto(`${home}/mural`);
  const type = page.getByRole('combobox', { name: 'Tipo', exact: true }); const status = page.getByRole('combobox', { name: 'Estado', exact: true });
  await type.selectOption('SUBMISSION'); await status.selectOption('APPROVED'); await expect(status).toHaveValue('APPROVED');
  await page.goBack(); await expect(type).toHaveValue('SUBMISSION'); await expect(status).toHaveValue('');
  await page.goBack(); await expect(type).toHaveValue(''); await page.goForward(); await expect(type).toHaveValue('SUBMISSION');
  await page.goForward(); await expect(status).toHaveValue('APPROVED');
});

for (const type of ['SUBMISSION', 'TICKET'] as const) {
  test(`${type} retorna ao mural com filtros da mesma loja preservados`, async ({ page }) => {
    await mockOrigin(page, type); const status = type === 'SUBMISSION' ? 'APPROVED' : 'FULFILLED';
    await page.goto(`${home}/mural?type=${type}&status=${status}&from=2026-10-01&to=2026-10-22`);
    await page.getByRole('link', { name: type === 'SUBMISSION' ? 'Abrir conquista' : 'Abrir ticket', exact: true }).click();
    const back = page.getByRole('link', { name: 'Voltar ao mural com os filtros', exact: true }); await expect(back).toBeVisible(); await back.click();
    await expect(page.getByRole('combobox', { name: 'Tipo', exact: true })).toHaveValue(type); await expect(page.getByRole('combobox', { name: 'Estado', exact: true })).toHaveValue(status);
    await expect(page.getByLabel('De', { exact: true })).toHaveValue('2026-10-01'); await expect(page.getByLabel('Até', { exact: true })).toHaveValue('2026-10-22');
  });
  for (const destination of [`/lojas/${ids.second}/mural?type=TICKET`, 'https://example.test/fora']) test(`${type} recusa retorno ${destination.startsWith('https') ? 'externo' : 'a outra loja'}`, async ({ page }) => {
    await mockOrigin(page, type); const origin = type === 'SUBMISSION' ? `${home}/registros/${noteId}` : `${home}/tickets/${ticketId}`;
    await page.goto(`${origin}?voltar=${encodeURIComponent(destination)}`);
    await expect(page.getByRole('link', { name: 'Voltar ao mural com os filtros', exact: true })).toHaveCount(0);
    const fallback = page.getByRole('link', { name: type === 'SUBMISSION' ? 'Voltar às atividades' : 'Voltar aos tickets com os filtros', exact: true });
    await expect(fallback).toHaveAttribute('href', `${home}/${type === 'SUBMISSION' ? 'atividades' : 'tickets'}`);
  });
}
