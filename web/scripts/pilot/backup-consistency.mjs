import { createHash } from 'node:crypto';

const tables = ['PointsEntry', 'Redemption', 'RedemptionEvent', 'SubmissionReviewEvent', 'Reward', 'ActivitySubmission', 'SubmissionEvent', 'AlbumEvent', 'OutboxEvent'];
export async function financialFingerprints(client) {
  const result = {};
  for (const table of tables) {
    const found = await client.query('SELECT to_regclass($1) AS name', [`app."${table}"`]);
    if (!found.rows[0].name) continue;
    await client.query(`DECLARE backup_financial NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS data FROM app."${table}" t ORDER BY id`);
    const hash = createHash('sha256'); let count = 0;
    try {
      for (;;) {
        const page = await client.query('FETCH 500 FROM backup_financial');
        for (const row of page.rows) { hash.update(row.data); hash.update('\n'); count += 1; }
        if (page.rowCount < 500) break;
      }
    } finally { await client.query('CLOSE backup_financial'); }
    result[table] = { count, sha256: hash.digest('hex') };
  }
  return result;
}
