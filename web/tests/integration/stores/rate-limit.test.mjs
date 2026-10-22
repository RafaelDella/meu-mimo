import test from 'node:test';
import assert from 'node:assert/strict';
import { domainFixture } from './helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';

test('123 leituras simultâneas aplicam o teto de 120 por conta sem afetar outra',
  { timeout: 60_000 }, async t => {
    const fixture = await domainFixture(t);
    const person = await fixture.user();
    const other = await fixture.user();
    const responses = await Promise.all(Array.from({ length: 123 }, () => person.client.get('/api/lojas')));
    assert.equal(responses.filter(response => response.status === 200).length, 120);
    const limited = responses.filter(response => response.status === 429);
    assert.equal(limited.length, 3);
    for (const response of limited) {
      expectStatus(response, 429);
      assert.ok(Number(response.headers.get('retry-after')) > 0);
      assert.match((await response.json()).message, /aguarde|tente|limite/i);
    }
    expectStatus(await other.client.get('/api/lojas'), 200);
  });

test('31 mutações simultâneas aplicam o teto de 30 sem bloquear leitura', { timeout: 60_000 }, async t => {
  const fixture = await domainFixture(t);
  const person = await fixture.user();
  const responses = await Promise.all(Array.from({ length: 31 }, () =>
    person.client.patch('/api/perfil', { displayName: 'Pessoa de teste' })));
  assert.equal(responses.filter(response => response.status === 200).length, 30);
  const limited = responses.filter(response => response.status === 429);
  assert.equal(limited.length, 1);
  expectStatus(limited[0], 429);
  assert.ok(Number(limited[0].headers.get('retry-after')) > 0);
  expectStatus(await person.client.get('/api/perfil'), 200);
});
