import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { domainFixture } from '../stores/helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
import { exportRecordPages } from '../../../scripts/pilot/rights-export-data.mjs';

test('exportação de convites contém apenas os usos da audiência e nenhuma credencial', async t => {
  const f = await domainFixture(t);
  const owner = await f.user(); const ana = await f.user(); const bia = await f.user();
  const store = await f.createDomainStore(owner);
  const response = await owner.client.post(`/api/lojas/${store.id}/convites`, {
    operationId: randomUUID(), kind: 'CODE', expiration: { kind: 'NEVER' }, maxUses: null,
  });
  expectStatus(response, 201); const invitation = await response.json();
  for (const person of [ana, bia]) expectStatus(await person.client.post('/api/convites/aceitar-codigo', { code: invitation.code }), 200);
  async function records(subjectId) {
    const result = [];
    for await (const page of exportRecordPages({ database: f.database }, subjectId)) {
      if (['Invitation', 'InvitationUse'].includes(page.type)) result.push(...page.rows.map(data => ({ type: page.type, data })));
    }
    return result;
  }
  const own = await records(ana.id); const merchant = await records(owner.id);
  assert.equal(own.filter(row => row.type === 'InvitationUse').length, 1);
  assert.equal(merchant.filter(row => row.type === 'InvitationUse').length, 2);
  assert.equal(own.find(row => row.type === 'Invitation').data.useCount, null);
  assert.equal(merchant.find(row => row.type === 'Invitation').data.useCount, 2);
  assert.equal(JSON.stringify(own).includes(bia.id), false);
  for (const data of [own, merchant]) {
    const serialized = JSON.stringify(data);
    assert.equal(serialized.includes(invitation.code), false);
    for (const key of ['codeHash', 'codeNonce', 'creationDigest', 'tokenHash', 'url']) assert.equal(serialized.includes(`"${key}"`), false);
  }
});
