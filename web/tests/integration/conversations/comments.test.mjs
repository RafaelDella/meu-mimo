import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { relationFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('500 caracteres Unicode são aceitos e texto simples não vira HTML ou dados do cliente', async t => {
  const f = await relationFixture(t);
  const maximum = '🌷'.repeat(500);
  assert.equal((await f.post(f.ana, maximum)).text, maximum);
  const markup = '<img src=x onerror=alert(1)> Oi!';
  assert.equal((await f.post(f.owner, `  ${markup}  `)).text, markup);
  for (const text of ['🌷'.repeat(501), '', '   ', 'Texto\u0000inválido']) {
    await errorCode(await f.ana.client.post(f.path(f.thread), { operationId: randomUUID(), text }), 400, 'field_invalid');
  }
  await errorCode(await f.ana.client.post(f.path(f.thread), { operationId: randomUUID(), text: 'Forjado', authorProfileId: f.owner.id }), 400);
});

test('repetição concorrente cria comentário e evento únicos; UUID não troca autor, assunto ou texto', async t => {
  const f = await relationFixture(t);
  const operationId = randomUUID();
  const bodies = await Promise.all(Array.from({ length: 5 }, async () => {
    const response = await f.ana.client.post(f.path(f.thread), { operationId, text: 'Um único comentário.' });
    expectStatus(response, 201);
    return response.json();
  }));
  assert.ok(bodies.every(body => body.id === operationId));
  assert.equal((await f.database.query('SELECT id FROM app."Comment" WHERE id = $1', [operationId])).rowCount, 1);
  assert.equal((await f.database.query('SELECT id FROM app."OutboxEvent" WHERE "commentId" = $1', [operationId])).rowCount, 1);
  for (const [person, thread, text] of [[f.ana, f.thread, 'Outro texto'], [f.owner, f.thread, 'Um único comentário.'],
    [f.ana, await f.conversation(), 'Um único comentário.']]) {
    await errorCode(await person.client.post(f.path(thread), { operationId, text }), 409, 'operation_conflict');
  }
});

test('páginas de comentários têm ordem estável e não aceitam limites fora do contrato', async t => {
  const f = await relationFixture(t);
  const comments = [];
  for (let index = 0; index < 3; index += 1) comments.push(await f.post(f.ana, `Comentário ${index + 1}`));
  const first = await f.ana.client.get(`${f.path(f.thread)}?page=1&pageSize=2`);
  expectStatus(first, 200);
  const page = await first.json();
  assert.equal(page.total, 3);
  assert.deepEqual(page.items.map(item => item.id), comments.slice(0, 2).map(item => item.id));
  const second = await f.owner.client.get(`${f.path(f.thread)}?page=2&pageSize=2`);
  assert.deepEqual((await second.json()).items.map(item => item.id), [comments[2].id]);
  for (const query of ['page=0', 'pageSize=51', 'page=NaN']) await errorCode(await f.ana.client.get(`${f.path(f.thread)}?${query}`), 400);
});

test('falha no evento reverte comentário e uma repetição recupera a operação sem órfão', async t => {
  const f = await relationFixture(t);
  const operationId = randomUUID();
  await f.withConstraint('OutboxEvent', `"storeId" <> '${f.store.id}'::uuid`, async () => {
    await errorCode(await f.ana.client.post(f.path(f.thread), { operationId, text: 'Tudo ou nada.' }), 503);
    assert.equal((await f.database.query('SELECT id FROM app."Comment" WHERE id = $1', [operationId])).rowCount, 0);
    assert.equal((await f.database.query('SELECT id FROM app."OutboxEvent" WHERE "commentId" = $1', [operationId])).rowCount, 0);
  });
  assert.equal((await f.post(f.ana, 'Tudo ou nada.', operationId)).id, operationId);
});
