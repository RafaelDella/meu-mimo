import assert from 'node:assert/strict';
import path from 'node:path';
import pg from 'pg';
import { readState } from '../local-runtime.mjs';
import { mediaEnvironment } from '../media-environment.mjs';
import { pilotResources } from './resources.mjs';
import { assertPilotDatabase, assertPilotRuntime } from './runtime-environment.mjs';
import { custodyRoot, readPrivateJson, writePrivateJson } from './custody.mjs';
import { BrowserSession, expectStatus } from '../../tests/integration/helpers/http-client.mjs';
import { confirmationLink } from '../../tests/integration/helpers/mail.mjs';

export const fixturePath = path.join(custodyRoot, 'reports', 'recovery-fixture.json');
export const reportPath = path.join(custodyRoot, 'reports', 'recovery-fixture-report.json');
export const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export const saveFixture = (state, options) => writePrivateJson(fixturePath, state, options);
export const disconnectRuntime = () => globalThis.meuMimoDatabase?.$disconnect();

export function environmentFor(mode) {
  assert.ok(['integration', 'restore'].includes(mode));
  const state = readState('t14', mode); const resources = pilotResources(mode);
  assertPilotRuntime(state.runtime, mode);
  assertPilotDatabase(state.integration.T02_DATABASE_URL, mode);
  assertPilotDatabase(state.integration.T02_AUTH_DATABASE_URL, mode, 'auth');
  assert.notEqual(new URL(state.integration.T02_DATABASE_URL).username, 'meumimo_runtime');
  assert.equal(state.integration.T02_PROJECT_ID, resources.project);
  assert.equal(state.integration.T02_TASK, 't14');
  assert.equal(state.integration.T02_TEST_ORIGIN, state.runtime.APP_ORIGIN);
  assert.equal(state.integration.SUPABASE_URL, state.runtime.SUPABASE_URL);
  assert.equal(state.integration.T02_MAIL_URL, `http://127.0.0.1:${resources.mailPort}`);
  return { state, resources, origin: state.runtime.APP_ORIGIN, supabaseURL: state.runtime.SUPABASE_URL,
    mailURL: state.integration.T02_MAIL_URL, databaseURL: state.integration.T02_DATABASE_URL,
    authDatabaseURL: state.integration.T02_AUTH_DATABASE_URL, publishableKey: state.runtime.SUPABASE_PUBLISHABLE_KEY };
}

export function sourceEnvironment({ select = false } = {}) {
  const environment = environmentFor('integration');
  const expected = { ...environment.state.runtime, ...environment.state.integration, ...mediaEnvironment('integration', 't14'),
    T06_MEDIA_FIXTURES: path.join(custodyRoot, 'fixtures') };
  if (select) Object.assign(process.env, expected);
  process.env.T06_MEDIA_FIXTURES ??= expected.T06_MEDIA_FIXTURES;
  for (const [key, value] of Object.entries(expected)) assert.equal(process.env[key], value, 'Ambiente operacional da fonte divergente.');
  return environment;
}

export function session(environment, cookies = []) {
  const client = new BrowserSession(environment); client.cookies = new Map(cookies); return client;
}

export function rebaseSourceURL(environment, value) {
  const url = new URL(value, 'http://127.0.0.1:4310');
  assert.ok(['http://127.0.0.1:4310', environment.origin].includes(url.origin));
  assert.equal(url.username, ''); assert.equal(url.password, ''); assert.equal(url.hash, '');
  return `${url.pathname}${url.search}`;
}

export async function json(client, target) {
  const response = await client.get(target); expectStatus(response, 200); return response.json();
}

export async function login(environment, person, status = 200) {
  const client = session(environment);
  expectStatus(await client.post('/api/auth/login', { email: person.email, password: person.password }), status);
  if (status === 200) assert.equal((await json(client, '/api/auth/session')).userId, person.id);
  return client;
}

export async function withDatabases(mode, operation) {
  const environment = environmentFor(mode);
  const database = new pg.Pool({ connectionString: environment.databaseURL, max: 2, connectionTimeoutMillis: 5000 });
  const authDatabase = new pg.Pool({ connectionString: environment.authDatabaseURL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const domain = (await database.query('SELECT current_database() AS name')).rows[0].name;
    const auth = (await authDatabase.query('SELECT current_database() AS name')).rows[0].name;
    assert.equal(domain, environment.resources.database); assert.equal(auth, 'postgres');
    return await operation({ environment, database, authDatabase });
  } finally { await database.end(); await authDatabase.end(); await disconnectRuntime(); }
}

export async function loadFixture(phases) {
  const state = await readPrivateJson(fixturePath);
  assert.equal(state.formatVersion, 1); assert.equal(state.kind, 't14-recovery-fixture');
  assert.ok(phases.includes(state.phase)); assert.ok(uuid(state.fixtureRun));
  assert.ok(uuid(state.store?.id));
  assert.deepEqual(Object.keys(state.people ?? {}).sort(), ['ana', 'bia', 'owner']);
  assert.deepEqual(Object.keys(state.memberships ?? {}).sort(), ['ana', 'bia', 'owner']);
  for (const name of ['owner', 'ana', 'bia']) {
    const person = state.people?.[name];
    assert.ok(uuid(person?.id) && /^[^@\s]+@example\.test$/.test(person.email));
    assert.ok(typeof person.password === 'string' && Array.isArray(person.cookies));
    assert.ok(uuid(state.memberships[name]?.id));
  }
  assert.equal(new Set(Object.values(state.people).map(person => person.id)).size, 3);
  return state;
}

export async function assertFixtureOwnership({ database, authDatabase }, state) {
  const people = Object.values(state.people);
  const users = (await authDatabase.query(`SELECT id,email,raw_app_meta_data->>'local_fixture' AS marker,
    raw_app_meta_data->>'fixture_run' AS run FROM auth.users WHERE id=ANY($1::uuid[]) OR email=ANY($2::text[])`,
  [people.map(person => person.id), people.map(person => person.email)])).rows;
  for (const row of users) {
    const person = people.find(item => item.id === row.id && item.email === row.email);
    assert.ok(person && row.marker === 'meumimo-t14' && row.run === state.fixtureRun, 'Marcador Auth da fixture divergente.');
  }
  for (const person of people) if (!users.some(row => row.id === person.id)) {
    assert.equal(person.id, state.people.ana.id); assert.ok(uuid(state.erasureInput?.operationId));
    const proof = (await database.query(`SELECT p.id FROM app."DataRightsProtocol" p
      WHERE p.id=$1 AND p."subjectProfileId"=$2 AND p."operatorProfileId"=$3 AND p.kind='ERASURE'
      AND (SELECT count(*) FROM app."DataSuppression" s WHERE s."subjectProfileId"=p."subjectProfileId")=2`,
    [state.erasureInput.operationId, person.id, state.people.owner.id])).rows;
    assert.equal(proof.length, 1, 'Conta ausente exige supressão própria registrada.');
  }
  const store = (await database.query('SELECT "createdByProfileId" FROM app."Store" WHERE id=$1', [state.store.id])).rows[0];
  assert.equal(store?.createdByProfileId, state.people.owner.id);
  const members = (await database.query('SELECT id,"profileId",role FROM app."Membership" WHERE "storeId"=$1 ORDER BY id', [state.store.id])).rows;
  assert.equal(members.length, 3);
  for (const name of ['owner', 'ana', 'bia']) {
    assert.ok(members.some(row => row.id === state.memberships[name].id && row.profileId === state.people[name].id
      && row.role === (name === 'owner' ? 'MERCHANT' : 'PARTICIPANT')));
  }
}

export async function pendingRecovery(environment, person, authDatabase) {
  const client = session(environment);
  expectStatus(await client.post('/api/auth/recovery', { email: person.email }), 202);
  let next = new URL(await confirmationLink(environment, person.email));
  for (let hop = 0; hop < 8; hop += 1) {
    if (next.origin === environment.origin && next.pathname === '/api/auth/callback') {
      const code = next.searchParams.get('code'); assert.ok(code && code.length <= 4096);
      const flow = next.searchParams.get('sb_flow_id');
      const name = flow ? `meumimo-auth-flow-${flow}-code-verifier` : 'meumimo-auth-code-verifier';
      const encoded = decodeURIComponent(client.cookies.get(name) ?? '');
      assert.ok(encoded.startsWith('base64-') && client.cookies.has(`${name}-context`));
      const raw = JSON.parse(Buffer.from(encoded.slice(7), 'base64url').toString('utf8'));
      assert.ok(typeof raw === 'string' && raw.endsWith('/recovery'));
      const verifier = raw.split('/')[0]; assert.match(verifier, /^[A-Za-z0-9._~-]{43,128}$/);
      const row = (await authDatabase.query('SELECT id FROM auth.flow_state WHERE auth_code=$1 AND user_id=$2', [code, person.id])).rows[0];
      assert.ok(uuid(row?.id), 'A prova exige código PKCE pendente no Auth real.');
      return { callback: next.href, code, verifier, flowStateId: row.id, cookies: [...client.cookies], capturedAt: new Date().toISOString() };
    }
    assert.equal(next.origin, environment.supabaseURL);
    const response = await client.get(next.href);
    assert.ok([301, 302, 303, 307, 308].includes(response.status));
    const location = response.headers.get('location'); assert.ok(location);
    next = new URL(location, next);
  }
  throw new Error('Código de recuperação real não chegou ao callback local.');
}
