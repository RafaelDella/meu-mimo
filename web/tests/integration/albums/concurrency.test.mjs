import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { albumFixture, closeRuntime } from './helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('mesma publicação concorrente confirma uma intenção e dois lotes da mesma versão exigem revisão', async t => {
  const f = await albumFixture(t); const assets = await f.ready(['photo.png', 'photo.webp', 'photo.png']);
  const request = f.body(await f.album(), [assets[0].id]);
  const responses = await Promise.all([1, 2, 3].map(() => f.owner.client.post(`${f.albumPath()}/publicacoes`, request)));
  for (const response of responses) expectStatus(response, 200);
  const results = await Promise.all(responses.map(response => response.json()));
  assert.ok(results.every(value => value.publication.id === request.operationId));
  assert.deepEqual(await f.counts(), { events: 1, items: 1, outbox: 1 });
  const current = await f.album();
  const different = await Promise.all(assets.slice(1).map(asset => f.owner.client.post(`${f.albumPath()}/publicacoes`, f.body(current, [asset.id]))));
  assert.deepEqual(different.map(response => response.status).sort(), [200, 409]);
  assert.deepEqual(await f.counts(), { events: 2, items: 2, outbox: 2 });
});

test('publicar versus remover nunca deixa mídia removida visível; remoção repetida tem um evento', async t => {
  const f = await albumFixture(t); const [asset] = await f.ready(); const before = await f.financial();
  const [publication, removal] = await Promise.all([
    f.owner.client.post(`${f.albumPath()}/publicacoes`, f.body(await f.album(), [asset.id])),
    f.owner.client.post(`${f.assetPath(asset.id)}/remover`, {}),
  ]);
  expectStatus(removal, 200); assert.ok([200, 404, 409].includes(publication.status));
  expectStatus(await f.owner.client.post(`${f.assetPath(asset.id)}/remover`, {}), 200);
  assert.equal((await f.album(f.ana)).total, 0);
  const rows = await f.database.query('SELECT kind,count(*)::int n FROM app."AlbumEvent" WHERE "albumId"=$1 GROUP BY kind', [f.memory.albumId]);
  assert.equal(rows.rows.find(row => row.kind === 'REMOVE').n, 1);
  assert.deepEqual(await f.financial(), before);
});

test('publicação versus cancelamento respeita ordem confirmada e não altera o efeito financeiro do cancelamento', async t => {
  const f = await albumFixture(t); const [asset] = await f.ready(); const current = await f.ticket();
  const [publication, cancellation] = await Promise.all([
    f.owner.client.post(`${f.albumPath()}/publicacoes`, f.body(await f.album(), [asset.id])),
    f.owner.client.post(`${f.ticketPath()}/transicoes`, { operationId: randomUUID(), expectedVersion: current.version,
      action: 'CANCEL', text: 'Cancelamento concorrente', expectedBalance: current.cancellationImpact.balanceBefore, restock: false }),
  ]);
  expectStatus(cancellation, 200); assert.ok([200, 409].includes(publication.status));
  const ticket = await f.ticket(); assert.equal(ticket.status, 'CANCELLED');
  assert.equal((await f.album(f.ana)).total, publication.status === 200 ? 1 : 0);
  const refund = await f.database.query('SELECT amount::text FROM app."PointsEntry" WHERE "redemptionId"=$1 AND kind=\'REDEMPTION_REFUND\'', [f.memory.subjectId]);
  assert.deepEqual(refund.rows, [{ amount: '1' }]);
});

for (const table of ['AlbumEvent', 'AlbumItem', 'MediaAsset', 'TicketAlbum', 'OutboxEvent']) {
  test(`falha em ${table} desfaz publicação inteira e retry recupera um único aviso`, async t => {
    const f = await albumFixture(t); const [asset] = await f.ready();
    const request = f.body(await f.album(), [asset.id]); const before = await f.financial();
    const name = `t11_failure_${randomUUID().replaceAll('-', '')}`;
    const expressions = {
      AlbumEvent: `id <> '${request.operationId}'::uuid`,
      AlbumItem: `"publicationId" <> '${request.operationId}'::uuid`,
      MediaAsset: `id <> '${asset.id}'::uuid OR "publishedAt" IS NULL`,
      TicketAlbum: `id <> '${f.memory.albumId}'::uuid OR version=${request.expectedVersion}`,
      OutboxEvent: `"albumEventId" IS DISTINCT FROM '${request.operationId}'::uuid`,
    };
    await f.database.query(`ALTER TABLE app."${table}" ADD CONSTRAINT "${name}" CHECK (${expressions[table]})`);
    try { expectStatus(await f.owner.client.post(`${f.albumPath()}/publicacoes`, request), 503); }
    finally { await f.database.query(`ALTER TABLE app."${table}" DROP CONSTRAINT "${name}"`); }
    assert.deepEqual(await f.counts(), { events: 0, items: 0, outbox: 0 });
    assert.equal((await f.album()).version, request.expectedVersion);
    assert.equal((await f.asset(f.owner, asset.id)).publishedAt, null);
    expectStatus(await f.owner.client.post(`${f.albumPath()}/publicacoes`, request), 200);
    assert.deepEqual(await f.counts(), { events: 1, items: 1, outbox: 1 });
    assert.deepEqual(await f.financial(), before);
  });
}
