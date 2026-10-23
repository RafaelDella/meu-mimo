import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import pg from 'pg';
import { createFixture } from '../../tests/integration/helpers/fixtures.mjs';
import { login, createStore, invite, createActivity, submitRecord, review, createReward, redeem, transition, fixtureFile as sourceFixture } from '../../tests/pilot-browser/helpers.ts';
import { localMailLink, waitForDomainBudget } from '../../tests/pilot-browser/helper-auth.ts';
import { readState } from '../local-runtime.mjs';
import { mediaEnvironment } from '../media-environment.mjs';
import { pilotRuntimeEnvironment } from './runtime-environment.mjs';
import { custodyRoot, readPrivateJson, writePrivateJson } from './custody.mjs';
import { readSupervisor } from './processes.mjs';
import { localHealth } from './health.mjs';
import { privateDiagnostic } from './error-diagnostic.mjs';

const fixtureFile = path.join(custodyRoot, 'reports', 'development-web-fixture.json');
const reportFile = path.join(custodyRoot, 'reports', 'development-web-check.json');
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
async function ready() {
  const health = await localHealth({ snapshot: await readSupervisor() }); assert.equal(health.status, 'ready');
}
async function load(phases) {
  const state = await readPrivateJson(fixtureFile);
  assert.equal(state.formatVersion, 1); assert.equal(state.kind, 't15-development-web'); assert.ok(uuid(state.run));
  assert.ok(phases.includes(state.phase));
  assert.deepEqual(Object.keys(state.people).sort(), ['ana', 'owner']);
  for (const person of Object.values(state.people)) {
    assert.ok((person.id === undefined || uuid(person.id)) && /^t15-web-[a-f0-9-]+@example\.test$/.test(person.email));
    assert.ok(typeof person.password === 'string' && person.password.length > 20);
  }
  assert.ok(state.storeId === undefined || uuid(state.storeId)); return state;
}
async function ownership(f, state, partial = false) {
  const removed = [];
  for (const person of Object.values(state.people)) {
    if (!person.id) {
      assert.ok(partial);
      const client = new pg.Client({ connectionString: f.environment.authDatabaseURL, connectionTimeoutMillis: 5000 });
      try {
        await client.connect();
        const existing = await client.query('SELECT 1 FROM auth.users WHERE email=$1', [person.email]);
        assert.equal(existing.rowCount, 0, 'Conta sem prova de posse exige conferência; fixture preservada.');
      } finally { await client.end(); }
      continue;
    }
    const { data, error } = await f.auth.auth.admin.getUserById(person.id);
    if (partial && state.phase === 'CLEANING' && error?.status === 404) { removed.push(person.id); continue; }
    assert.equal(error, null);
    assert.equal(data.user.email, person.email); assert.equal(data.user.app_metadata.local_fixture, 'meumimo-t15');
    assert.equal(data.user.app_metadata.fixture_run, state.run);
  }
  if (!state.storeId) { assert.ok(partial); return removed; }
  const store = (await f.database.query('SELECT "createdByProfileId" FROM app."Store" WHERE id=$1', [state.storeId])).rows;
  if (partial && state.phase === 'CLEANING' && !store.length) return removed;
  assert.deepEqual(store, [{ createdByProfileId: state.people.owner.id }]);
  const members = (await f.database.query('SELECT "profileId" FROM app."Membership" WHERE "storeId"=$1 ORDER BY "profileId"', [state.storeId])).rows;
  const ownIds = Object.values(state.people).map(person => person.id).filter(Boolean);
  if (partial) assert.ok(members.every(row => ownIds.includes(row.profileId)));
  else assert.deepEqual(members.map(row => row.profileId).sort(), ownIds.sort());
  return removed;
}
async function persisted(f, state, balance = '5', status = 'WAITING_AGREEMENT') {
  const row = (await f.database.query(`SELECT status,"rewardCost","rewardName" FROM app."Redemption"
    WHERE id=$1 AND "storeId"=$2 AND "authorProfileId"=$3`, [state.ticketId, state.storeId, state.people.ana.id])).rows[0];
  assert.equal(row.status, status); assert.equal(row.rewardCost, 10); assert.equal(row.rewardName, state.rewardName);
  const current = (await f.database.query(`SELECT COALESCE(sum(p.amount),0)::text balance FROM app."PointsEntry" p
    JOIN app."Membership" m ON m.id=p."participantMembershipId" WHERE p."storeId"=$1 AND m."profileId"=$2`,
  [state.storeId, state.people.ana.id])).rows[0].balance;
  assert.equal(current, balance);
}
async function persistedPhoto(f, state, page) {
  const row = (await f.database.query(`SELECT m.id,m.state,m.sha256,m."outputVersion",m."displayBytes"
    FROM app."MediaAsset" m JOIN app."ActivitySubmission" s ON s."evidenceAssetId"=m.id
    WHERE s.id=$1 AND s."storeId"=$2 AND s."authorProfileId"=$3`,
  [state.recordId, state.storeId, state.people.ana.id])).rows[0];
  assert.equal(row.state, 'READY'); assert.ok(uuid(row.id) && uuid(row.outputVersion));
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(row.sha256, digest(await readFile(sourceFixture('photo-gps-orientation.jpg'))));
  await page.goto(`/lojas/${state.storeId}/registros/${state.recordId}`);
  await page.getByRole('button', { name: 'Abrir arquivo', exact: true }).click();
  const image = page.getByRole('img', { name: 'Foto privada deste item', exact: true });
  await expect(image).toBeVisible(); await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
  const response = await page.request.get(await image.getAttribute('src')); assert.equal(response.status(), 200);
  const bytes = await response.body(); assert.equal(bytes.length, row.displayBytes);
  const stored = await f.auth.storage.from('meumimo-t06-private').download(`t14-development/${row.id}/${row.outputVersion}/display.jpg`);
  assert.equal(stored.error, null); assert.equal(digest(Buffer.from(await stored.data.arrayBuffer())), digest(bytes));
  state.mediaDigest = digest(bytes);
}
async function signup(browser, f, account, run, watch) {
  const context = await browser.newContext({ baseURL: f.environment.origin, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); watch(page); f.trackEmail(account.email); await page.goto('/conta');
  await page.getByRole('navigation', { name: 'Acesso à conta' }).getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.locator('form').getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByText('Se os dados estiverem corretos, confira seu e-mail.', { exact: true })).toBeVisible();
  await page.goto(await localMailLink(f.environment, account.email, 'signup'));
  await expect(page.getByText('Você está na sua conta', { exact: true })).toBeVisible();
  const identity = await (await page.request.get('/api/auth/session')).json(); assert.ok(uuid(identity.userId));
  account.id = identity.userId; f.trackUser(account.id);
  const verified = await f.auth.auth.admin.getUserById(account.id); assert.equal(verified.error, null);
  assert.equal(verified.data.user.email, account.email); assert.ok(verified.data.user.email_confirmed_at);
  const marked = await f.auth.auth.admin.updateUserById(account.id, { app_metadata: { local_fixture: 'meumimo-t15', fixture_run: run } });
  assert.equal(marked.error, null); return { page, context };
}

export async function developmentWebCheck(phase) {
  assert.ok(['prepare', 'media-invalid', 'verify', 'cleanup'].includes(phase));
  await ready();
  Object.assign(process.env, pilotRuntimeEnvironment(readState('t14'), 'development'), mediaEnvironment('development', 't14'));
  const hooks = []; const f = await createFixture({ after: fn => hooks.push(fn) }, { target: 'development' });
  let browser; let state; let pageErrors = 0; const cleanup = phase === 'cleanup';
  const watch = page => page.on('pageerror', () => { pageErrors += 1; });
  try {
    browser = cleanup ? null : await chromium.launch({ headless: true });
    if (phase === 'prepare') {
      let previous;
      try { previous = await readPrivateJson(fixtureFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      assert.ok(!previous || previous.phase === 'CLEANED', 'Uma fixture anterior pendente deve ser conferida.');
      state = { formatVersion: 1, kind: 't15-development-web', run: randomUUID(), phase: 'PREPARING', people: {} };
      for (const role of ['owner', 'ana']) state.people[role] = { email: `t15-web-${randomUUID()}@example.test`, password: `T15!${randomUUID()}` };
      await writePrivateJson(fixtureFile, state);
      const owner = await signup(browser, f, state.people.owner, state.run, watch); await writePrivateJson(fixtureFile, state);
      const ana = await signup(browser, f, state.people.ana, state.run, watch); await writePrivateJson(fixtureFile, state);
      state.storeId = await createStore(owner.page, f.trackStore); await writePrivateJson(fixtureFile, state);
      await invite(owner.page, ana.page, state.storeId);
      state.activityId = await createActivity(owner.page, state.storeId);
      state.recordId = await submitRecord(ana.page, state.storeId, state.activityId, true);
      await review(owner.page, state.storeId, state.recordId, 'Aprovar registro');
      state.rewardId = await createReward(owner.page, state.storeId);
      state.ticketId = await redeem(ana.page, state.storeId, state.rewardId);
      state.rewardName = (await f.database.query('SELECT name FROM app."Reward" WHERE id=$1', [state.rewardId])).rows[0].name;
      await ownership(f, state); await persisted(f, state);
      state.phase = 'PREPARED'; state.preparedAt = new Date().toISOString(); await writePrivateJson(fixtureFile, state);
    } else {
      state = await load(phase === 'media-invalid' ? ['PREPARED'] : phase === 'verify' ? ['PREPARED', 'VERIFIED'] : ['PREPARING', 'PREPARED', 'VERIFIED', 'CLEANING']);
      const removed = await ownership(f, state, cleanup);
      if (phase === 'media-invalid') {
        await persisted(f, state);
        const context = await browser.newContext({ baseURL: f.environment.origin }); const owner = await context.newPage(); watch(owner);
        await login(owner, state.people.owner); await owner.goto(`/lojas/${state.storeId}/tickets/${state.ticketId}`);
        await owner.getByRole('button', { name: 'Adicionar momentos', exact: true }).click();
        const name = 'video-invalido-operacao.mp4';
        await owner.locator('input[type=file][aria-label="Escolher arquivos da galeria"]').setInputFiles({
          name, mimeType: 'video/mp4', buffer: Buffer.from('Payload sintético que não é um arquivo MP4.'),
        });
        await owner.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true }).click();
        await expect.poll(async () => (await f.database.query(`SELECT m.state,m."failureCode" FROM app."MediaAsset" m
          JOIN app."TicketAlbum" a ON a."collectionId"=m."collectionId" WHERE a."redemptionId"=$1
          AND a."storeId"=$2 AND m."authorProfileId"=$3 AND m."mediaType"='VIDEO'`,
        [state.ticketId, state.storeId, state.people.owner.id])).rows, { timeout: 30_000 }).toEqual([{ state: 'FAILED', failureCode: 'file_invalid' }]);
        await owner.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
        const row = owner.getByRole('list', { name: 'Arquivos selecionados e enviados' }).getByRole('listitem', { name, exact: true });
        await expect(row).toContainText('Este arquivo não pôde ser processado. Remova-o e escolha outro compatível.');
        for (let sample = 0; sample < 3; sample += 1) {
          await new Promise(resolve => setTimeout(resolve, 5000)); await ready();
        }
        await persisted(f, state); state.invalidMediaCheckedAt = new Date().toISOString(); await writePrivateJson(fixtureFile, state);
      } else if (phase === 'verify') {
        const status = (await f.database.query('SELECT status FROM app."Redemption" WHERE id=$1 AND "storeId"=$2',
          [state.ticketId, state.storeId])).rows[0]?.status;
        assert.ok(['WAITING_AGREEMENT', 'CANCELLED'].includes(status));
        await persisted(f, state, status === 'CANCELLED' ? '15' : '5', status);
        const context = await browser.newContext({ baseURL: f.environment.origin }); const ana = await context.newPage(); watch(ana);
        await login(ana, state.people.ana); await persistedPhoto(f, state, ana);
        await ana.goto(`/lojas/${state.storeId}/tickets/${state.ticketId}`);
        const ticket = ana.getByRole('article', { name: 'Seu vale mimo', exact: true });
        await expect(ticket.getByRole('heading', { name: state.rewardName, exact: true })).toBeVisible();
        await expect(ticket.getByText('10 pontos · Uma unidade', { exact: true })).toBeVisible();
        const ownerContext = await browser.newContext({ baseURL: f.environment.origin }); const owner = await ownerContext.newPage(); watch(owner);
        await login(owner, state.people.owner); await waitForDomainBudget(f.database, state.people.owner.id);
        if (status !== 'CANCELLED') await transition(owner, state.storeId, state.ticketId, 'Cancelar e devolver pontos', 'Confirmar cancelamento e devolução', 'Motivo do cancelamento');
        await persisted(f, state, '15', 'CANCELLED'); await ana.reload();
        const events = (await f.database.query(`SELECT count(*)::int count FROM app."RedemptionEvent"
          WHERE "redemptionId"=$1 AND kind='CANCEL'`, [state.ticketId])).rows[0];
        assert.equal(events.count, 1);
        const refunds = (await f.database.query(`SELECT amount::text amount FROM app."PointsEntry"
          WHERE "redemptionId"=$1 AND amount>0`, [state.ticketId])).rows;
        assert.deepEqual(refunds, [{ amount: '10' }]);
        await expect(ana.getByRole('article', { name: 'Seu vale mimo', exact: true })).toContainText('Cancelado');
        state.phase = 'VERIFIED'; state.verifiedAt = new Date().toISOString(); await writePrivateJson(fixtureFile, state);
      } else {
        for (const person of Object.values(state.people)) if (person.id) {
          f.trackUser(person.id); f.trackEmail(person.email);
          if (removed.includes(person.id)) f.trackAuthRemoval(person.id);
        }
        if (state.storeId) f.trackStore(state.storeId);
      }
    }
    if (cleanup) {
      state.phase = 'CLEANING'; await writePrivateJson(fixtureFile, state);
      for (const hook of hooks.reverse()) await hook();
      state.phase = 'CLEANED'; state.cleanedAt = new Date().toISOString(); await writePrivateJson(fixtureFile, state);
    }
    assert.equal(pageErrors, 0);
    const result = { code: `DEVELOPMENT_WEB_${phase.toUpperCase().replaceAll('-', '_')}_VERIFIED`, counts: { users: 2, stores: 1, photos: 1, tickets: 1, pageErrors,
      ...(phase === 'media-invalid' ? { failedVideos: 1, readySamples: 3 } : {}) },
      checkedAt: new Date().toISOString() };
    await writePrivateJson(reportFile, result); return result;
  } finally {
    try { await browser?.close(); } finally { await f.close(); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3); process.stdout.write(`${JSON.stringify(await developmentWebCheck(process.argv[2]))}\n`);
  } catch (error) {
    await writePrivateJson(reportFile, { code: 'DEVELOPMENT_WEB_CHECK_FAILED', diagnostic: privateDiagnostic(error) });
    process.stderr.write('DEVELOPMENT_WEB_CHECK_FAILED; fixture própria preservada.\n'); process.exitCode = 1;
  }
}
