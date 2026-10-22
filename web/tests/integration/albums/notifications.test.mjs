import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { albumFixture, closeRuntime } from './helpers.mjs';
import { deliver } from '../points/helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('uma publicação gera uma novidade privada agrupada com destino reautorizado e replay sem duplicação', async t => {
  const f = await albumFixture(t); const assets = await f.ready(['photo.png', 'photo.webp']);
  const result = await f.publish(assets.map(asset => ({ assetId: asset.id, caption: 'Legenda secreta do álbum' })));
  expectStatus(await f.owner.client.post(`${f.albumPath()}/publicacoes`, result.request), 200);
  await Promise.all([deliver(), deliver()]); await deliver();
  const rows = (await f.database.query(`SELECT e."recipientMembershipId",n.id FROM app."OutboxEvent" e
    JOIN app."Notification" n ON n."eventId"=e.id WHERE e."albumEventId"=$1`, [result.publication.id])).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].recipientMembershipId, f.participation.id);
  const notices = await f.read('/api/notificacoes', f.ana);
  assert.doesNotMatch(JSON.stringify(notices), /Legenda secreta/);
  assert.equal(notices.items.filter(item => item.kind === 'ALBUM_PUBLISHED').length, 1);
  const path = `/api/notificacoes/${rows[0].id}/destino`;
  const target = await f.read(path, f.ana); const url = new URL(target.path, f.environment.origin);
  assert.equal(url.pathname, f.ticketPath().replace('/api', '')); assert.equal(url.searchParams.get('publicacao'), result.publication.id);
  await errorCode(await f.owner.client.get(path), 404); await errorCode(await f.bia.client.get(path), 404);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  await errorCode(await f.ana.client.get(path), 404);
  assert.equal((await f.read('/api/notificacoes', f.ana)).total, 0);
});
