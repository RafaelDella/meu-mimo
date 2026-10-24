import test from 'node:test';
import assert from 'node:assert/strict';
import { domainFixture } from './helpers.mjs';
import { codeInvitation, searchCode } from './code-helpers.mjs';
import { errorCode } from '../helpers/http-client.mjs';

test('nome autorizado igual ao código continua na lista; filtros não escondem o convite', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const person = await f.user();
  const store = await f.createDomainStore(owner, 'Lojinha privada do convite');
  const invitation = await codeInvitation(owner, store);
  const named = await f.createDomainStore(person, invitation.code);
  const result = await searchCode(person, invitation.code.toLowerCase());
  assert.deepEqual(result.stores.items.map(item => item.id), [named.id]);
  assert.equal(result.invitation.store.id, store.id);
  assert.equal(result.invitation.viewerAction, 'JOIN');
  const filtered = await searchCode(person, invitation.code, { role: 'PARTICIPANT', state: 'CLOSED' });
  assert.equal(filtered.stores.total, 0);
  assert.equal(filtered.invitation.store.id, store.id);
  const paged = await searchCode(person, invitation.code, { page: 2, pageSize: 1, resolveInvitation: false });
  assert.equal(paged.stores.total, 1);
  assert.equal(paged.stores.page, 2);
  assert.deepEqual(paged.stores.items, []);
  assert.equal(paged.invitation, null);
  const before = await f.database.query('SELECT "useCount" FROM app."Invitation" WHERE id=$1', [invitation.id]);
  assert.equal(before.rows[0].useCount, 0);
});

test('Unicode, paginação, nomes sem código e campos inválidos preservam fronteira', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const stranger = await f.user();
  const store = await f.createDomainStore(owner, 'Ateliê da 🌻');
  const result = await searchCode(owner, '🌻', { role: 'MERCHANT', state: 'ALL', pageSize: 1 });
  assert.equal(result.invitation, null);
  assert.equal(result.stores.items[0].id, store.id);
  const hidden = await searchCode(stranger, '🌻');
  assert.equal(hidden.stores.total, 0);
  assert.equal(hidden.invitation, null);
  for (const body of [
    { q: 'x'.repeat(81) }, { q: '\ud800' }, { q: 'x\n' }, { q: 7 }, { q: '', role: 'ADMIN' },
    { q: '', state: 'UNKNOWN' }, { q: '', page: 0 }, { q: '', page: '2' }, { q: '', pageSize: 51 },
    { q: '', resolveInvitation: 'false' }, { q: '', profileId: stranger.id },
  ]) {
    const response = await owner.client.post('/api/lojas/buscar', body);
    assert.equal(response.status, 400, `Entrada inválida: ${JSON.stringify(body)}`);
    await errorCode(response, 400, 'field_invalid');
  }
});
