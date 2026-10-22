import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function transaction(client, work) {
  await client.query('BEGIN');
  try { const value = await work(); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}

/** Dados fictícios somente no banco exclusivo criado por check-migrations. */
export async function checkRedemptionsMigration(database, runtime, context) {
  const { storeId, merchantId, participantId, profileId, otherStoreId } = context;
  const tables = ['Reward', 'RewardEvent', 'Redemption', 'RedemptionEvent'];
  assert.equal((await database.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='app' AND rowsecurity")).rows[0].n, 26);
  for (const table of tables) {
    for (const role of ['anon', 'authenticated']) {
      await database.query('BEGIN');
      try {
        await database.query(`SET LOCAL ROLE ${role}`);
        await assert.rejects(database.query(`SELECT * FROM app."${table}"`), { code: '42501' });
      } finally { await database.query('ROLLBACK'); }
    }
    const privileges = await runtime.query(`SELECT has_table_privilege(current_user,$1,'SELECT') AS read,
      has_table_privilege(current_user,$1,'INSERT') AS create,
      has_table_privilege(current_user,$1,'DELETE') AS delete`, [`app."${table}"`]);
    assert.deepEqual(privileges.rows[0], { read: true, create: true, delete: false });
    if (table !== 'Reward') {
      await assert.rejects(runtime.query(`UPDATE app."${table}" SET "storeId"=$1`, [storeId]), { code: '42501' });
    }
    await assert.rejects(runtime.query(`DELETE FROM app."${table}" WHERE "storeId"=$1`, [storeId]), { code: '42501' });
  }
  const rewardId = randomUUID();
  const fields = { name: 'Mimo fictício de migração', description: '', category: 'A dois', sticker: 'gift',
    cost: 3, note: 'Recadinho preservado', instructions: 'Combinar por aqui', available: true, stock: 2, stockRevision: 1 };
  const insertReward = () => runtime.query(`INSERT INTO app."Reward"
    (id,"storeId","createdByProfileId",name,description,category,sticker,cost,note,instructions,available,stock)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  [rewardId, storeId, merchantId, fields.name, fields.description, fields.category, fields.sticker,
    fields.cost, fields.note, fields.instructions, fields.available, fields.stock]);
  const audit = (id = rewardId, version = 1) => runtime.query(`INSERT INTO app."RewardEvent"
    (id,"storeId","rewardId","actorProfileId",version,kind,"requestDigest",configuration)
    VALUES ($1,$2,$3,$4,$5,'CREATE',$6,$7)`,
  [id, storeId, rewardId, merchantId, version, 'a'.repeat(64), fields]);
  await assert.rejects(transaction(runtime, insertReward), { code: '23514' });
  await transaction(runtime, async () => { await insertReward(); await audit(); });
  await assert.rejects(audit(randomUUID(), 2), { code: '23514' });
  await assert.rejects(runtime.query('UPDATE app."Reward" SET "storeId"=$2 WHERE id=$1',
    [rewardId, otherStoreId]), { code: '42501' });
  await assert.rejects(runtime.query('UPDATE app."Reward" SET stock=1,"stockRevision"=2 WHERE id=$1',
    [rewardId]), { code: '23514' });
  assert.equal((await runtime.query('SELECT stock FROM app."Reward" WHERE id=$1', [rewardId])).rows[0].stock, 2);

  async function issue({ omit = '', stock = true, overrides = {} } = {}) {
    const id = randomUUID();
    const balance = (await runtime.query(`SELECT COALESCE(sum(amount),0)::text AS amount FROM app."PointsEntry"
      WHERE "storeId"=$1 AND "participantMembershipId"=$2`, [storeId, participantId])).rows[0].amount;
    assert.ok(BigInt(balance) >= 3n, 'A emissão deve usar crédito real preservado de T07/T08.');
    const reward = (await runtime.query('SELECT stock,"stockRevision" FROM app."Reward" WHERE id=$1', [rewardId])).rows[0];
    const date = (await runtime.query(`SELECT clock_timestamp() AS now,timezone FROM app."Store" WHERE id=$1`, [storeId])).rows[0];
    const local = (await runtime.query(`SELECT to_char($1::timestamptz AT TIME ZONE $2,'YYYY-MM-DD') AS date`, [date.now, date.timezone])).rows[0].date;
    if (stock) await runtime.query('UPDATE app."Reward" SET stock=stock-1,"stockRevision"="stockRevision"+1 WHERE id=$1', [rewardId]);
    const values = { id, storeId, rewardId, participantId, profileId, before: balance,
      after: String(BigInt(balance) - 3n), stockBefore: reward.stock, stockAfter: reward.stock - 1,
      revision: stock ? reward.stockRevision + 1 : reward.stockRevision, rewardVersion: 1, ...overrides };
    await runtime.query(`INSERT INTO app."Redemption"
      (id,"storeId","rewardId","participantMembershipId","authorProfileId",code,"requestDigest","expectedBalance",
      "rewardVersion","rewardName","rewardDescription","rewardCategory","rewardSticker","rewardCost","rewardNote","rewardInstructions",
      "balanceBefore","balanceAfter","stockBefore","stockAfter","stockRevision",timezone,"localDate","createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$20,$9,'',$10,'gift',3,$11,$12,$8,$13,$14,$15,$16,$17,$18,$19)`,
    [id, values.storeId, rewardId, values.participantId, values.profileId, `MIMO-${id.toUpperCase()}`, 'b'.repeat(64), values.before,
      fields.name, fields.category, fields.note, fields.instructions, values.after, values.stockBefore, values.stockAfter,
      values.revision, date.timezone, local, date.now, values.rewardVersion]);
    if (omit !== 'event') await runtime.query(`INSERT INTO app."RedemptionEvent"
      (id,"storeId","redemptionId","actorProfileId",kind,"createdAt") VALUES ($1,$2,$3,$4,'ISSUED',$5)`,
    [randomUUID(), storeId, id, profileId, date.now]);
    if (omit !== 'ledger') await runtime.query(`INSERT INTO app."PointsEntry"
      (id,"storeId","participantMembershipId","redemptionId","actorProfileId",kind,amount,"sourceKey","createdAt")
      VALUES ($1,$2,$3,$4,$5,'REDEMPTION_DEBIT',-3,$6,$7)`,
    [randomUUID(), storeId, participantId, id, profileId, `redemption.debit:${id}`, date.now]);
    if (omit !== 'conversation') await runtime.query(`INSERT INTO app."Conversation"
      (id,"storeId","participantMembershipId","subjectType","subjectId") VALUES ($1,$2,$3,'TICKET',$4)`,
    [randomUUID(), storeId, participantId, id]);
    if (omit !== 'outbox') await runtime.query(`INSERT INTO app."OutboxEvent"
      (id,key,kind,"storeId","participantMembershipId","actorProfileId","recipientMembershipId","redemptionId")
      SELECT $1,$2,'REDEMPTION_ISSUED',$3,$4,$5,id,$6 FROM app."Membership" WHERE "storeId"=$3 AND role='MERCHANT'`,
    [randomUUID(), `redemption.issued:${id}`, storeId, participantId, profileId, id]);
    return id;
  }
  for (const omit of ['event', 'ledger', 'conversation', 'outbox']) {
    await assert.rejects(transaction(runtime, () => issue({ omit })), { code: '23514' });
    assert.equal((await runtime.query('SELECT stock FROM app."Reward" WHERE id=$1', [rewardId])).rows[0].stock, 2);
    assert.equal((await runtime.query('SELECT id FROM app."Redemption" WHERE "rewardId"=$1', [rewardId])).rowCount, 0);
  }
  await assert.rejects(transaction(runtime, () => issue({ stock: false })), { code: '23514' });
  await assert.rejects(transaction(runtime, () => issue({ overrides: { storeId: otherStoreId } })), { code: '23514' });
  // Uma auditoria inserida por último não pode transformar reposição em consumo.
  await assert.rejects(transaction(runtime, async () => {
    await runtime.query('UPDATE app."Reward" SET stock=3,"stockRevision"=2,version=2 WHERE id=$1', [rewardId]);
    await issue({ stock: false, overrides: { rewardVersion: 2, stockBefore: 4, stockAfter: 3 } });
    await runtime.query(`INSERT INTO app."RewardEvent"
      (id,"storeId","rewardId","actorProfileId",version,kind,"requestDigest",configuration)
      VALUES ($1,$2,$3,$4,2,'UPDATE',$5,$6)`,
    [randomUUID(), storeId, rewardId, merchantId, 'd'.repeat(64), { ...fields, stock: 3, stockRevision: 2 }]);
  }), { code: '23514' });
  const ticketId = await transaction(runtime, () => issue());
  const ticket = (await runtime.query('SELECT * FROM app."Redemption" WHERE id=$1', [ticketId])).rows[0];
  assert.equal(ticket.rewardName, fields.name);
  assert.equal(ticket.rewardNote, fields.note);
  assert.equal(ticket.balanceAfter, String(BigInt(ticket.balanceBefore) - 3n));
  assert.equal((await runtime.query('SELECT stock FROM app."Reward" WHERE id=$1', [rewardId])).rows[0].stock, 1);
  assert.equal((await runtime.query('SELECT amount::text FROM app."PointsEntry" WHERE "redemptionId"=$1', [ticketId])).rows[0].amount, '-3');
  await assert.rejects(runtime.query(`INSERT INTO app."PointsEntry"
    (id,"storeId","participantMembershipId","actorProfileId",kind,amount,"sourceKey")
    VALUES ($1,$2,$3,$4,'ACTIVITY_CREDIT',1,$5)`, [randomUUID(), storeId, participantId, profileId, randomUUID()]), { code: '23514' });
  await assert.rejects(runtime.query(`INSERT INTO app."PointsEntry"
    (id,"storeId","participantMembershipId","redemptionId","actorProfileId",kind,amount,"sourceKey")
    VALUES ($1,$2,$3,$4,$5,'REDEMPTION_DEBIT',3,$6)`,
  [randomUUID(), storeId, participantId, ticketId, profileId, `redemption.debit:${ticketId}`]), { code: '23514' });
  const constraints = await database.query(`SELECT conname,convalidated FROM pg_constraint
    WHERE connamespace='app'::regnamespace AND conname=ANY($1::text[])`, [[
    'Redemption_reward_store_fkey', 'Redemption_participant_store_fkey', 'Redemption_author_membership_fkey',
    'RedemptionEvent_context_fkey', 'Points_redemption_context_fkey', 'Outbox_redemption_context_fkey',
    'Points_review_context_fkey', 'Points_compensation_context_fkey', 'Outbox_review_context_fkey',
  ]]);
  assert.equal(constraints.rowCount, 9);
  assert.ok(constraints.rows.every(row => row.convalidated));
}
