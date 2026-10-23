import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withMaintenanceLock } from './custody.mjs';
import { applyRights, erasureReport } from './rights-apply.mjs';
import { exportStatus, exportRights } from './rights-export.mjs';
import { protocolInput, rightsError, rightsProtocol, verifyRightsFixtures, withRightsDatabase, withRightsOperator } from './rights-db.mjs';

export { applyRights, exportRights };

export async function openRightsProtocol(value, options = {}) {
  const input = protocolInput(value);
  return withMaintenanceLock(() => withRightsDatabase(options, async context => {
    const existing = (await context.database.query('SELECT * FROM app."DataRightsProtocol" WHERE id=$1', [input.operationId])).rows[0];
    if (existing) {
      if (existing.subjectProfileId !== input.subjectProfileId || existing.operatorProfileId !== input.operatorProfileId ||
          existing.kind !== input.kind || existing.requestDigest !== input.requestDigest || existing.verifiedAt.toISOString() !== input.verifiedAt) throw rightsError();
      const status = existing.kind === 'EXPORT' ? (await exportStatus(context, existing)).status : 'PARTIAL';
      return { protocolId: existing.id, status };
    }
    await verifyRightsFixtures(context, input.subjectProfileId, input.operatorProfileId);
    await withRightsOperator(context.database, async () => {
      await context.database.query(`INSERT INTO app."DataRightsProtocol"(id,"subjectProfileId","operatorProfileId",kind,"requestDigest","verifiedAt")
        VALUES($1,$2,$3,$4,$5,$6)`, [input.operationId, input.subjectProfileId, input.operatorProfileId, input.kind, input.requestDigest, input.verifiedAt]);
      await context.database.query(`INSERT INTO app."DataRightsEvent"(id,"protocolId",sequence,code) VALUES($1,$2,1,'REGISTERED')`, [randomUUID(), input.operationId]);
    });
    return { protocolId: input.operationId, status: 'PARTIAL' };
  }));
}

export async function rightsStatus(protocolId, options = {}) {
  return withMaintenanceLock(() => withRightsDatabase(options, async context => {
    const protocol = await rightsProtocol(context, protocolId);
    if (protocol.kind === 'ERASURE') return erasureReport(context, protocol);
    return exportStatus(context, protocol);
  }));
}

function command(arguments_) {
  const [action, ...flags] = arguments_;
  if (!['register', 'export', 'erase', 'status'].includes(action) || flags.length % 2) throw rightsError();
  const names = { '--mode': 'mode', '--operation': 'operationId', '--subject': 'subjectProfileId',
    '--operator': 'operatorProfileId', '--kind': 'kind', '--verified-at': 'verifiedAt' };
  const values = {};
  for (let index = 0; index < flags.length; index += 2) {
    const key = names[flags[index]];
    if (!key || Object.hasOwn(values, key) || flags[index + 1].startsWith('--')) throw rightsError();
    values[key] = flags[index + 1];
  }
  const options = { mode: values.mode ?? 'development' }; delete values.mode;
  if (action === 'register') return openRightsProtocol(values, options);
  if (Object.keys(values).join() !== 'operationId') throw rightsError();
  return ({ export: exportRights, erase: applyRights, status: rightsStatus })[action](values.operationId, options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(await command(process.argv.slice(2))) + '\n'); }
  catch { process.stderr.write('Não foi possível concluir o procedimento local de direitos. Confira os impedimentos na operação autorizada.\n'); process.exitCode = 1; }
}
