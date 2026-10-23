import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { illustrations } from '../../../src/contracts/illustrations.ts';
import { redemptionFixture, closeRuntime, rewardFields } from './helpers.mjs';
import { errorCode } from '../helpers/http-client.mjs';

after(closeRuntime);

test('novos desenhos são aceitos nos mimos e o ticket preserva a escolha da ocasião', async t => {
  const f = await redemptionFixture(t);
  await f.credit(30);
  let reward = await f.createReward({ sticker: 'camera' });
  const ticket = await f.redeem(reward);
  for (const { value } of illustrations.slice(4)) {
    reward = await f.updateReward(reward, { sticker: value });
    assert.equal(reward.sticker, value);
    assert.equal((await f.preview(reward)).sticker, value);
  }
  assert.equal((await f.ticket(ticket)).snapshot.sticker, 'camera');
  assert.equal((await f.balance()).available, '20');
});

test('novos desenhos são aceitos nas atividades e a conquista preserva a escolha da ocasião', async t => {
  const f = await redemptionFixture(t);
  const original = await f.create({ name: 'Uma leitura', sticker: 'book', points: 5 });
  const conquest = await f.submit(await f.prepare(original));
  assert.equal(conquest.snapshot.sticker, 'book');
  await f.update(original, { sticker: 'jar' });
  const historical = await f.latest(conquest);
  assert.equal(historical.activity.sticker, 'jar');
  assert.equal(historical.snapshot.sticker, 'book');
  for (const { value } of illustrations.slice(4)) {
    const activity = await f.create({ sticker: value });
    assert.equal(activity.sticker, value);
  }
});

test('biblioteca continua recusando URLs e nomes desconhecidos; ausência de desenho é exclusiva da atividade', async t => {
  const f = await redemptionFixture(t);
  assert.equal((await f.create({ sticker: '' })).sticker, '');
  for (const sticker of ['', 'unknown', '../gift', 'https://example.test/image.svg']) {
    await errorCode(await f.owner.client.post(`${f.base()}/mimos`, {
      operationId: randomUUID(), ...rewardFields({ sticker }),
    }), 400, 'field_invalid');
  }
  for (const sticker of ['unknown', '../gift', 'https://example.test/image.svg']) {
    await errorCode(await f.owner.client.post(`${f.base()}/atividades`, {
      operationId: randomUUID(), name: 'Atividade inválida', points: 5, sticker,
    }), 400, 'field_invalid');
  }
});
