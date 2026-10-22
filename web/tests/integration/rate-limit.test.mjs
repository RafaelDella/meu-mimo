import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './helpers/fixtures.mjs';
import { errorCode, expectStatus } from './helpers/http-client.mjs';

const neutralMessage = 'Se os dados estiverem corretos, confira seu e-mail.';

async function rateKeys(database) {
  return new Set((await database.query('SELECT key FROM app."AuthRateBucket"')).rows.map(row => row.key));
}

async function ownNewBucket(fixture, before) {
  const added = [...await rateKeys(fixture.database)].filter(key => !before.has(key));
  assert.equal(added.length, 1, 'O ensaio serial deve criar apenas a chave da conta deste teste.');
  fixture.trackRateKey(added[0]);
  return added[0];
}

async function expectLimited(response, maximumWait) {
  await errorCode(response, 429, 'rate_limited');
  const retryAfter = response.headers.get('retry-after');
  assert.match(retryAfter ?? '', /^[1-9]\d*$/);
  assert.ok(Number(retryAfter) <= maximumWait, 'Retry-After deve refletir a janela de autenticação.');
}

test('login limita cinco tentativas por minuto e não aceita origem de IP forjada para burlar a conta', async t => {
  const fixture = await createFixture(t);
  const email = fixture.newEmail();
  const before = await rateKeys(fixture.database);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fixture.client().post('/api/auth/login', {
      email: attempt % 2 ? email.toUpperCase() : email, password: 'Senha-incorreta!',
    }, { 'X-Forwarded-For': `192.0.2.${attempt + 1}` });
    await errorCode(response, 401, 'login_failed');
  }
  const key = await ownNewBucket(fixture, before);
  assert.match(key, /^[\da-f]{64}$/);
  assert.equal(key.includes(email.toLowerCase()), false, 'A chave não deve guardar o e-mail em claro.');
  await expectLimited(await fixture.client().post('/api/auth/login', {
    email, password: 'Senha-incorreta!',
  }, { 'X-Forwarded-For': '198.51.100.99' }), 60);
  const result = await fixture.database.query('SELECT cardinality(attempts) AS count FROM app."AuthRateBucket" WHERE key = $1', [key]);
  assert.equal(result.rows[0].count, 5, 'Tentativas bloqueadas não devem ampliar a janela indefinidamente.');
});

test('tentativas concorrentes da mesma conta não ultrapassam o limite de cinco', async t => {
  const fixture = await createFixture(t);
  const email = fixture.newEmail();
  const before = await rateKeys(fixture.database);
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => fixture.client().post(
    '/api/auth/login', { email, password: 'Senha-incorreta!' }, { 'X-Forwarded-For': `203.0.113.${index + 1}` },
  )));
  assert.equal(responses.filter(response => response.status === 401).length, 5);
  assert.equal(responses.filter(response => response.status === 429).length, 3);
  for (const response of responses) {
    if (response.status === 429) await expectLimited(response, 60);
    else await errorCode(response, 401, 'login_failed');
  }
  const key = await ownNewBucket(fixture, before);
  const result = await fixture.database.query('SELECT cardinality(attempts) AS count FROM app."AuthRateBucket" WHERE key = $1', [key]);
  assert.equal(result.rows[0].count, 5);
});

test('janela de login libera nova tentativa depois de expirar os eventos anteriores', async t => {
  const fixture = await createFixture(t);
  const email = fixture.newEmail();
  const before = await rateKeys(fixture.database);
  await errorCode(await fixture.client().post('/api/auth/login', { email, password: 'Senha-incorreta!' }), 401);
  const key = await ownNewBucket(fixture, before);
  await fixture.database.query(`UPDATE app."AuthRateBucket"
    SET attempts = ARRAY[clock_timestamp() - interval '61 seconds', clock_timestamp() - interval '62 seconds',
      clock_timestamp() - interval '63 seconds', clock_timestamp() - interval '64 seconds',
      clock_timestamp() - interval '65 seconds'] WHERE key = $1`, [key]);
  await errorCode(await fixture.client().post('/api/auth/login', { email, password: 'Senha-incorreta!' }), 401);
  const result = await fixture.database.query('SELECT cardinality(attempts) AS count FROM app."AuthRateBucket" WHERE key = $1', [key]);
  assert.equal(result.rows[0].count, 1);
});

test('recuperação tem resposta neutra e bloqueia o quarto pedido por destinatário em uma hora', async t => {
  const fixture = await createFixture(t);
  const email = fixture.newEmail();
  const before = await rateKeys(fixture.database);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fixture.client().post('/api/auth/recovery', {
      email: attempt % 2 ? email.toUpperCase() : email,
    });
    expectStatus(response, 202);
    assert.deepEqual(await response.json(), { message: neutralMessage });
  }
  const key = await ownNewBucket(fixture, before);
  assert.match(key, /^[\da-f]{64}$/);
  assert.equal(key.includes(email.toLowerCase()), false);
  await expectLimited(await fixture.client().post('/api/auth/recovery', { email }), 3600);
  const result = await fixture.database.query('SELECT cardinality(attempts) AS count FROM app."AuthRateBucket" WHERE key = $1', [key]);
  assert.equal(result.rows[0].count, 3);
});

test('limite de recuperação é atômico e os eventos de mais de uma hora deixam de contar', async t => {
  const fixture = await createFixture(t);
  const email = fixture.newEmail();
  const before = await rateKeys(fixture.database);
  const responses = await Promise.all(Array.from({ length: 5 }, () =>
    fixture.client().post('/api/auth/recovery', { email })));
  assert.equal(responses.filter(response => response.status === 202).length, 3);
  assert.equal(responses.filter(response => response.status === 429).length, 2);
  for (const response of responses) {
    if (response.status === 429) await expectLimited(response, 3600);
    else {
      expectStatus(response, 202);
      assert.deepEqual(await response.json(), { message: neutralMessage });
    }
  }
  const key = await ownNewBucket(fixture, before);
  await fixture.database.query(`UPDATE app."AuthRateBucket"
    SET attempts = ARRAY[clock_timestamp() - interval '3601 seconds', clock_timestamp() - interval '3602 seconds',
      clock_timestamp() - interval '3603 seconds'] WHERE key = $1`, [key]);
  expectStatus(await fixture.client().post('/api/auth/recovery', { email }), 202);
  const result = await fixture.database.query('SELECT cardinality(attempts) AS count FROM app."AuthRateBucket" WHERE key = $1', [key]);
  assert.equal(result.rows[0].count, 1);
});
