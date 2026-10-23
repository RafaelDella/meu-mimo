import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminSnapshotTables } from './check-admin-migration-helpers.mjs';

export const rightsTables = ['DataRightsProtocol', 'DataRightsEvent', 'DataSuppression'];
const previousTables = [...adminSnapshotTables, 'SecurityAudit', 'AuthRateBucket', 'AdminAction'];

export async function rightsEvolutionSnapshot(database, subjectId = null) {
  const snapshot = new Map();
  for (const table of previousTables) {
    const rows = (await database.query(`SELECT to_jsonb(t) AS row FROM app."${table}" t ORDER BY to_jsonb(t)::text`)).rows;
    const projected = rows.map(({ row }) => {
      const own = table === 'Profile' ? row.id === subjectId : table === 'MediaAsset' ? row.authorProfileId === subjectId : row.profileId === subjectId;
      const omitted = !own ? [] : table === 'Profile' ? ['displayName'] : ['AuthSession', 'AdminGrant'].includes(table) ? ['revokedAt'] :
        table === 'MediaAsset' ? ['state', 'removedAt', 'availableAt', 'leaseToken'] : [];
      return Object.fromEntries(Object.entries(row).filter(([key]) => !omitted.includes(key)));
    });
    snapshot.set(table, projected.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  }
  return snapshot;
}

export function assertRightsPreserved(before, after) {
  for (const [table, rows] of before) assert.deepEqual(after.get(table), rows, `T14 preserva dados e bloqueios anteriores de ${table}.`);
}

const membershipSQL = `SELECT grantor,admin_option,inherit_option,set_option FROM pg_auth_members
  WHERE roleid='meumimo_rights_operator'::regrole AND member=current_user::regrole ORDER BY grantor`;

/** SET ROLE controlado; membership temporário é revertido/restaurado sem mudar flags preexistentes. */
export async function withRightsOperator(database, operation) {
  const before = (await database.query(membershipSQL)).rows;
  await database.query('BEGIN');
  try {
    const canSet = (await database.query("SELECT pg_has_role(current_user,'meumimo_rights_operator','SET') AS allowed")).rows[0].allowed;
    const own = (await database.query(`${membershipSQL.replace('ORDER BY grantor', '')} AND grantor=current_user::regrole`)).rows[0];
    if (!canSet) await database.query('GRANT meumimo_rights_operator TO CURRENT_USER WITH SET TRUE GRANTED BY CURRENT_USER');
    await database.query('SET LOCAL ROLE meumimo_rights_operator');
    const result = await operation();
    // Valida também MEMORY enquanto o papel operacional ainda é o current_user.
    await database.query('SET CONSTRAINTS ALL IMMEDIATE');
    await database.query('RESET ROLE');
    if (!canSet) {
      if (own) {
        for (const [flag, field] of [['INHERIT', 'inherit_option'], ['SET', 'set_option'], ['ADMIN', 'admin_option']]) {
          await database.query(`GRANT meumimo_rights_operator TO CURRENT_USER WITH ${flag} ${own[field] ? 'TRUE' : 'FALSE'} GRANTED BY CURRENT_USER`);
        }
      } else await database.query('REVOKE meumimo_rights_operator FROM CURRENT_USER GRANTED BY CURRENT_USER');
    }
    assert.deepEqual((await database.query(membershipSQL)).rows, before);
    await database.query('COMMIT');
    return result;
  } catch (error) {
    await database.query('ROLLBACK');
    assert.deepEqual((await database.query(membershipSQL)).rows, before);
    throw error;
  }
}

export async function registerRights(database, fixture, options = {}) {
  const input = { id: randomUUID(), subjectId: fixture.subjectId, operatorId: fixture.operatorId,
    kind: 'ERASURE', digest: 'a'.repeat(64), verifiedAt: new Date(Date.now() - 1000), ...options };
  await database.query(`INSERT INTO app."DataRightsProtocol" (id,"subjectProfileId","operatorProfileId",kind,"requestDigest","verifiedAt")
    VALUES ($1,$2,$3,$4,$5,$6)`, [input.id, input.subjectId, input.operatorId, input.kind, input.digest, input.verifiedAt]);
  await appendRightsEvent(database, input.id, 1, 'REGISTERED');
  return input;
}

export async function appendRightsEvent(database, protocolId, sequence, code, counts = {}) {
  return database.query(`INSERT INTO app."DataRightsEvent" (id,"protocolId",sequence,code,"countsJson") VALUES ($1,$2,$3,$4,$5)`,
    [randomUUID(), protocolId, sequence, code, JSON.stringify(counts)]);
}

export async function suppressRights(database, protocolId, subjectId, scopes = ['IDENTITY', 'AUTHORED_CONTENT']) {
  for (const scope of scopes) await database.query(`INSERT INTO app."DataSuppression" ("subjectProfileId",scope,"protocolId") VALUES ($1,$2,$3)`,
    [subjectId, scope, protocolId]);
}

export async function applyDataErasure(database, protocolId) {
  return (await database.query('SELECT app.apply_data_erasure($1::uuid) AS counts', [protocolId])).rows[0].counts;
}

export async function rightsMigrationFixture(database, context) {
  const subjectId = context.merchantId; const operatorId = randomUUID();
  const sessionId = randomUUID(); const revokedSessionId = randomUUID();
  await database.query('INSERT INTO app."Profile" (id,"displayName") VALUES ($1,$2)', [operatorId, 'Operadora fictícia de direitos']);
  await database.query(`INSERT INTO app."AuthSession" (id,"profileId","revokedAt") VALUES ($1,$2,NULL),($3,$2,clock_timestamp()-interval '1 hour')`,
    [sessionId, subjectId, revokedSessionId]);
  await database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1) ON CONFLICT ("profileId") DO NOTHING', [subjectId]);
  const collections = (await database.query(`SELECT DISTINCT c.id FROM app."MediaCollection" c
    JOIN app."TicketAlbum" a ON a."collectionId"=c.id JOIN app."MediaAsset" m ON m."collectionId"=c.id
    WHERE m."authorProfileId"=$1 AND m."removedAt" IS NULL ORDER BY c.id`, [subjectId])).rows;
  assert.ok(collections.length >= 2, 'A prova usa álbuns reais criados na evolução T11.');
  const memoryId = collections[0].id; const heldMemoryId = collections[1].id;
  await database.query(`UPDATE app."MediaCollection" SET "retentionHold"=false,"retentionUntil"=clock_timestamp()+interval '90 days' WHERE id=$1`, [memoryId]);
  await database.query('UPDATE app."MediaCollection" SET "retentionHold"=true WHERE id=$1', [heldMemoryId]);
  const collectionId = randomUUID(); const ownAssetId = randomUUID(); const foreignAssetId = randomUUID();
  await database.query(`INSERT INTO app."MediaCollection" (id,"storeId","participantMembershipId",purpose,"subjectId","retentionHold")
    VALUES ($1,$2,$3,'EVIDENCE',$4,false)`, [collectionId, context.storeId, context.participantId, randomUUID()]);
  for (const [id, author] of [[ownAssetId, subjectId], [foreignAssetId, context.profileId]]) {
    await database.query(`INSERT INTO app."MediaAsset"
      (id,"collectionId","authorProfileId",revision,"mediaType","mimeType","byteLength",sha256,state,"uploadedBytes","leaseToken","leaseUntil")
      VALUES ($1,$2,$3,1,'PHOTO','image/jpeg',1,$4,'PROCESSING',1,$5,clock_timestamp()+interval '5 minutes')`,
    [id, collectionId, author, 'c'.repeat(64), randomUUID()]);
  }
  const memoryAssetId = (await database.query(`SELECT id FROM app."MediaAsset" WHERE "collectionId"=$1 AND "removedAt" IS NULL ORDER BY id LIMIT 1`, [memoryId])).rows[0].id;
  const heldAssetId = (await database.query(`SELECT id FROM app."MediaAsset" WHERE "collectionId"=$1 AND "removedAt" IS NULL ORDER BY id LIMIT 1`, [heldMemoryId])).rows[0].id;
  return { subjectId, operatorId, sessionId, revokedSessionId, memoryId, heldMemoryId, ownAssetId, foreignAssetId, memoryAssetId, heldAssetId };
}
