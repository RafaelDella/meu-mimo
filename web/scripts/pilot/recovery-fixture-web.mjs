import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { loadFixture, withDatabases, saveFixture, uuid, assertFixtureOwnership } from './recovery-fixture-context.mjs';
import { assertFinancial } from './recovery-fixture-evidence.mjs';

async function loginPage(browser, environment, person, contexts, pageErrors) {
  const context = await browser.newContext({ baseURL: environment.origin, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  contexts.push(context); const page = await context.newPage();
  page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(30_000);
  page.on('pageerror', () => { pageErrors.count += 1; });
  await page.goto('/conta');
  await page.getByLabel('E-mail', { exact: true }).fill(person.email);
  await page.getByLabel('Senha', { exact: true }).fill(person.password);
  await page.locator('form').getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByText('Você está na sua conta', { exact: true }).waitFor({ state: 'visible' });
  return page;
}

function resourceId(page, environment, segment) {
  const url = new URL(page.url()); assert.equal(url.origin, environment.origin);
  const id = url.pathname.split(`/${segment}/`)[1]?.split('/')[0]; assert.ok(uuid(id)); return id;
}

async function waitBudget({ database, environment }, profileId) {
  const keys = ['read', 'write'].map(kind => createHmac('sha256', environment.state.runtime.AUTH_RATE_LIMIT_SECRET)
    .update('meumimo:t04:domain-rate:v1\0').update(kind).update('\0').update(profileId).digest('hex'));
  const deadline = Date.now() + 65_000;
  do {
    const rows = (await database.query(`SELECT key,(SELECT count(*)::int FROM unnest(attempts) AS recent(instant)
      WHERE recent.instant>clock_timestamp()-interval '60 seconds') AS used FROM app."AuthRateBucket" WHERE key=ANY($1::text[])`, [keys])).rows;
    const used = new Map(rows.map(row => [row.key, row.used]));
    if ((used.get(keys[0]) ?? 0) <= 70 && (used.get(keys[1]) ?? 0) <= 20) return;
    await delay(1000);
  } while (Date.now() < deadline);
  throw new Error('A cota real não liberou o orçamento do ciclo web de recuperação.');
}

const balance = async (database, state, name) => (await database.query(`SELECT coalesce(sum(amount),0)::text AS value
  FROM app."PointsEntry" WHERE "storeId"=$1 AND "participantMembershipId"=$2`, [state.store.id, state.memberships[name].id])).rows[0].value;

async function assertOneCycle(database, state) {
  const { rewardId, ticketId } = state.webProof;
  const rows = (await database.query(`SELECT id,status,"authorProfileId","rewardCost","balanceBefore"::text,"balanceAfter"::text
    FROM app."Redemption" WHERE "rewardId"=$1 AND "participantMembershipId"=$2`, [rewardId, state.memberships.bia.id])).rows;
  assert.equal(rows.length, 1); const ticket = rows[0];
  assert.equal(ticket.id, ticketId); assert.equal(ticket.authorProfileId, state.people.bia.id);
  assert.equal(ticket.status, 'CANCELLED'); assert.equal(ticket.rewardCost, 10);
  assert.equal(ticket.balanceBefore, state.webProof.balanceBefore);
  assert.equal(BigInt(ticket.balanceAfter), BigInt(state.webProof.balanceBefore) - 10n);
  const events = (await database.query('SELECT kind FROM app."RedemptionEvent" WHERE "redemptionId"=$1 ORDER BY version', [ticketId])).rows;
  assert.deepEqual(events.map(row => row.kind), ['ISSUED', 'CANCEL']);
  const ledger = (await database.query('SELECT amount::text FROM app."PointsEntry" WHERE "redemptionId"=$1 ORDER BY "createdAt",id', [ticketId])).rows;
  assert.deepEqual(ledger.map(row => row.amount), ['-10', '10']);
  assert.equal(await balance(database, state, 'bia'), state.webProof.balanceBefore);
  assert.equal(await balance(database, state, 'ana'), '5');
}

/** Mutates only the isolated restored copy, after its captured financial snapshot was checked. */
export async function verifyWeb() {
  const state = await loadFixture(['RESTORE_VERIFIED']);
  return withDatabases('restore', async context => {
    const { environment, database } = context; assert.equal(environment.origin, 'http://127.0.0.1:4320');
    await assertFixtureOwnership(context, state); await assertFinancial(database, state);
    state.phase = 'WEB_RUNNING'; state.webProof = { startedAt: new Date().toISOString(), balanceBefore: await balance(database, state, 'bia') };
    assert.equal(state.webProof.balanceBefore, '15'); await saveFixture(state);
    const browser = await chromium.launch({ headless: true }); const contexts = []; const pageErrors = { count: 0 };
    try {
      const owner = await loginPage(browser, environment, state.people.owner, contexts, pageErrors);
      const bia = await loginPage(browser, environment, state.people.bia, contexts, pageErrors);
      await waitBudget(context, state.people.owner.id);
      await owner.goto(`/lojas/${state.store.id}/mimos/novo`);
      await owner.getByLabel('Nome do mimo', { exact: true }).fill(`Mimo da cópia recuperada ${randomUUID().slice(0, 8)}`);
      await owner.getByLabel('Custo em pontos', { exact: true }).fill('10');
      await owner.getByLabel('Estoque ilimitado', { exact: true }).uncheck();
      await owner.getByLabel('Quantidade disponível agora', { exact: true }).fill('3');
      await owner.getByRole('button', { name: 'Salvar mimo', exact: true }).click();
      await owner.waitForURL(/\/mimos\/[a-f0-9-]{36}$/);
      state.webProof.rewardId = resourceId(owner, environment, 'mimos'); await saveFixture(state);
      const reward = (await database.query('SELECT "createdByProfileId",cost FROM app."Reward" WHERE id=$1', [state.webProof.rewardId])).rows[0];
      assert.equal(reward?.createdByProfileId, state.people.owner.id); assert.equal(reward.cost, 10);
      await waitBudget(context, state.people.bia.id);
      await bia.goto(`/lojas/${state.store.id}/mimos/${state.webProof.rewardId}`);
      await bia.getByRole('button', { name: 'Resgatar mimo', exact: true }).click();
      await bia.getByRole('dialog').getByRole('button', { name: 'Confirmar e resgatar', exact: true }).click();
      await bia.waitForURL(/\/tickets\/[a-f0-9-]{36}$/);
      state.webProof.ticketId = resourceId(bia, environment, 'tickets'); await saveFixture(state);
      assert.equal(await balance(database, state, 'bia'), '5');
      await waitBudget(context, state.people.owner.id);
      await owner.goto(`/lojas/${state.store.id}/tickets/${state.webProof.ticketId}`);
      await owner.getByRole('button', { name: 'Cancelar e devolver pontos', exact: true }).click();
      const dialog = owner.getByRole('dialog');
      await dialog.getByLabel('Motivo do cancelamento', { exact: true }).fill('Ensaio sintético na cópia restaurada.');
      await dialog.getByRole('button', { name: 'Confirmar cancelamento e devolução', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await assertOneCycle(database, state);
      await owner.reload(); await bia.reload();
      await owner.getByRole('article', { name: 'Seu vale mimo', exact: true }).waitFor({ state: 'visible' });
      assert.equal(await owner.getByRole('button', { name: 'Cancelar e devolver pontos', exact: true }).count(), 0);
      await assertOneCycle(database, state); assert.equal(pageErrors.count, 0);
      state.phase = 'WEB_VERIFIED'; state.webProof.verifiedAt = new Date().toISOString(); await saveFixture(state);
      return { code: 'RECOVERY_WEB_COPY_VERIFIED', webVerified: true,
        counts: { authenticatedPeople: 2, createdRewards: 1, issuedTickets: 1, cancelEvents: 1, refundEntries: 1, pageErrors: 0 } };
    } finally {
      await Promise.allSettled(contexts.map(context => context.close())); await browser.close();
    }
  });
}
