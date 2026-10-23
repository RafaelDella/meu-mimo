import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { redemptionFixture } from '../redemptions/helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';
export { closeRuntime, deliver } from '../redemptions/helpers.mjs';

export async function relationshipFixture(t) {
  const f = await redemptionFixture(t);
  const notePath = (member = f.participation) => `${f.base()}/participacoes/${member.id}/bilhete`;
  const ownNotePath = `${f.base()}/bilhete`;
  const read = (target, person = f.owner) => f.read(person, target);
  const note = (person = f.owner, member = f.participation) => read(notePath(member), person);
  async function send(text = 'Um carinho para você.', extra = {}, member = f.participation) {
    const current = await note(f.owner, member);
    const request = { operationId: randomUUID(), expectedVersion: current.current?.version ?? 0, text, ...extra };
    const response = await f.owner.client.patch(notePath(member), request);
    expectStatus(response, 200); return { ...(await response.json()), request };
  }
  const versionPath = version => `${f.base()}/bilhetes/versoes/${version.id ?? version}`;
  async function mark(version, person = f.ana) {
    const response = await person.client.post(`${versionPath(version)}/lida`, {});
    expectStatus(response, 200); return response.json();
  }
  async function thread(person = f.ana, extra = {}) {
    const record = await f.received({ name: 'Origem real do mural', ...extra }, person);
    const conversation = (await f.database.query(`SELECT id FROM app."Conversation"
      WHERE "subjectType"='SUBMISSION' AND "subjectId"=$1`, [record.id])).rows[0];
    assert.ok(conversation); return { ...conversation, record };
  }
  const reactionPath = conversation => `${f.base()}/conversas/${conversation.id}/reacao`;
  async function react(conversation, emoji = '❤️', person = f.ana, extra = {}) {
    const current = await read(reactionPath(conversation), person);
    const request = { operationId: randomUUID(), expectedVersion: current.version, emoji, ...extra };
    const response = await person.client.request(reactionPath(conversation), { method: 'PUT', json: request });
    expectStatus(response, 200); return { ...(await response.json()), request };
  }
  async function comment(conversation, text = 'Uma conversa privada.', person = f.ana) {
    const response = await person.client.post(`${f.base()}/conversas/${conversation.id}/comentarios`,
      { operationId: randomUUID(), text });
    expectStatus(response, 201); return response.json();
  }
  const groups = (person = f.owner, query = '') => read(`/api/notificacoes/grupos${query}`, person);
  async function markGroup(group, throughVersion = group.version, person = f.owner) {
    const response = await person.client.post(`/api/notificacoes/grupos/${group.id}/lida`, { throughVersion });
    expectStatus(response, 200); return response.json();
  }
  const preferencePath = `${f.base()}/preferencias/notificacoes`;
  const preferences = (person = f.ana) => read(preferencePath, person);
  async function preference(extra = {}, person = f.ana) {
    const current = await preferences(person);
    const request = { operationId: randomUUID(), expectedVersion: current.version,
      socialMuted: current.socialMuted, automaticApprovalNotices: current.automaticApprovalNotices, ...extra };
    const response = await person.client.patch(preferencePath, request);
    expectStatus(response, 200); return { ...(await response.json()), request };
  }
  async function resetLimits(...people) {
    const keys = (people.length ? people : [f.owner, f.ana, f.bia]).flatMap(person => ['read', 'write'].map(kind =>
      createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET).update('meumimo:t04:domain-rate:v1\0')
        .update(kind).update('\0').update(person.id).digest('hex')));
    await f.database.query('DELETE FROM app."AuthRateBucket" WHERE key=ANY($1::text[])', [keys]);
  }
  async function financial() {
    return (await f.database.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM app."PointsEntry" p WHERE "storeId"=$1) ledger,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM app."Reward" r WHERE "storeId"=$1) rewards,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM app."Redemption" r WHERE "storeId"=$1) tickets`, [f.store.id])).rows[0];
  }
  const feed = (person = f.ana, query = '') => read(`${f.base()}/mural${query}`, person);
  const dashboard = (person = f.owner) => read(`${f.base()}/${person === f.owner ? 'resumo' : 'lojinha'}`, person);
  async function withEventClock(instant, work) {
    assert.ok(Number.isFinite(Date.parse(instant)));
    const name = `t12_clock_${randomUUID().replaceAll('-', '')}`;
    await f.database.query(`CREATE FUNCTION app."${name}"() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN IF NEW."storeId"='${f.store.id}'::uuid AND NEW.kind='COMMENT_CREATED' THEN
        NEW."createdAt"='${new Date(instant).toISOString()}'::timestamptz; END IF; RETURN NEW; END $body$`);
    try {
      await f.database.query(`CREATE TRIGGER "${name}" BEFORE INSERT ON app."OutboxEvent" FOR EACH ROW EXECUTE FUNCTION app."${name}"()`);
      try { return await work(); }
      finally { await f.database.query(`DROP TRIGGER "${name}" ON app."OutboxEvent"`); }
    } finally { await f.database.query(`DROP FUNCTION app."${name}"()`); }
  }
  return { ...f, read, notePath, ownNotePath, note, send, versionPath, mark, thread,
    reactionPath, react, comment, groups, markGroup, preferencePath, preferences, preference,
    resetLimits, financial, feed, dashboard, withEventClock };
}
