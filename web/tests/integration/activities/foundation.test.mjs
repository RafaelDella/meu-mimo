import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { activityFixture, closeRuntime } from './helpers.mjs';

after(closeRuntime);

test('atividade real começa manual, sem saldo ou registro fictício', async t => {
  const f = await activityFixture(t);
  const activity = await f.create();
  assert.equal(activity.approvalMode, 'MANUAL');
  assert.equal(activity.version, 1);
  const page = await f.read(f.ana, `${f.base()}/atividades`);
  assert.equal(page.total, 1);
  assert.equal(page.items[0].id, activity.id);
  assert.equal(page.items[0].availability.used, 0);
  assert.equal(page.items[0].availability.eligible, true);
  assert.equal((await f.read(f.owner, `${f.base()}/registros`)).total, 0);
  const points = await f.balance();
  assert.equal(points.available, '0');
  assert.equal(points.pending, '0');
});
