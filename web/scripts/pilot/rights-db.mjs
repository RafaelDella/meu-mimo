import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { readState } from '../local-runtime.mjs';
import { pilotResources } from './resources.mjs';
import { assertPilotDatabase, pilotRuntimeEnvironment } from './runtime-environment.mjs';
import { withRightsOperator } from '../check-rights-migration-helpers.mjs';

export { withRightsOperator };
export const rightsError = () => new Error('Operação de direitos local inválida ou indisponível.');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function rightsId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw rightsError();
  return value.toLowerCase();
}

export function rightsMode(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => key !== 'mode')) throw rightsError();
  const mode = options.mode ?? 'development';
  if (!['development', 'integration'].includes(mode)) throw rightsError();
  return mode;
}

export function protocolInput(value) {
  const fields = ['operationId', 'subjectProfileId', 'operatorProfileId', 'kind', 'verifiedAt'];
  if (!value || Object.keys(value).sort().join() !== [...fields].sort().join() ||
      !['EXPORT', 'ERASURE'].includes(value.kind) || typeof value.verifiedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.verifiedAt)) || new Date(value.verifiedAt).toISOString() !== value.verifiedAt ||
      Date.parse(value.verifiedAt) > Date.now()) throw rightsError();
  const input = { operationId: rightsId(value.operationId), subjectProfileId: rightsId(value.subjectProfileId),
    operatorProfileId: rightsId(value.operatorProfileId), kind: value.kind, verifiedAt: value.verifiedAt };
  return { ...input, requestDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex') };
}

/** Credencial operacional fica neste processo; nunca é copiada para ambiente Next. */
export async function withRightsDatabase(options, operation) {
  const mode = rightsMode(options); const state = readState('t14', mode);
  const resources = pilotResources(mode); const runtime = pilotRuntimeEnvironment(state, mode);
  const connectionString = state.migration?.[mode];
  assertPilotDatabase(connectionString, mode);
  if (new URL(connectionString).username === 'meumimo_runtime') throw rightsError();
  let claims;
  try { claims = JSON.parse(Buffer.from(state.integration.SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64url').toString()); }
  catch { throw rightsError(); }
  if (claims.role !== 'service_role') throw rightsError();
  const auth = createClient(runtime.SUPABASE_URL, state.integration.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const database = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await database.connect();
    const target = (await database.query('SELECT current_database() AS database,current_user AS role')).rows[0];
    if (target.database !== resources.database || target.role === 'meumimo_runtime') throw rightsError();
    return await operation({ mode, resources, runtime, auth, database, connectionString,
      serviceRole: state.integration.SUPABASE_SERVICE_ROLE_KEY, bucket: state.media?.bucket });
  } finally { await database.end(); }
}

export async function rightsProtocol(context, id, kind) {
  const row = (await context.database.query('SELECT * FROM app."DataRightsProtocol" WHERE id=$1', [rightsId(id)])).rows[0];
  if (!row || (kind && row.kind !== kind)) throw rightsError();
  return row;
}

function fixtureUser(user) {
  const metadata = user?.app_metadata;
  if (!user || !/^[^@\s]+@example\.test$/i.test(user.email ?? '') || metadata?.local_fixture !== 'meumimo-t14' ||
      typeof metadata.fixture_run !== 'string' || !UUID.test(metadata.fixture_run)) throw rightsError();
  return { id: rightsId(user.id), run: metadata.fixture_run.toLowerCase(), email: user.email, createdAt: user.created_at };
}

export function authUserMissing(error) {
  return error?.status === 404 || error?.code === 'user_not_found';
}

export async function verifyRightsFixtures(context, subjectId, operatorId, { allowMissingSubject = false } = {}) {
  const operator = await context.auth.auth.admin.getUserById(rightsId(operatorId));
  if (operator.error) {
    if (allowMissingSubject && subjectId === operatorId && authUserMissing(operator.error)) return { subjectMissing: true, run: null };
    throw rightsError();
  }
  const verifiedOperator = fixtureUser(operator.data.user);
  const subject = subjectId === operatorId ? operator : await context.auth.auth.admin.getUserById(rightsId(subjectId));
  if (subject.error) {
    if (allowMissingSubject && authUserMissing(subject.error)) return { subjectMissing: true, run: verifiedOperator.run };
    throw rightsError();
  }
  const verifiedSubject = fixtureUser(subject.data.user);
  if (verifiedSubject.run !== verifiedOperator.run) throw rightsError();
  return { subjectMissing: false, run: verifiedOperator.run,
    identity: { id: verifiedSubject.id, email: verifiedSubject.email, createdAt: verifiedSubject.createdAt } };
}

/** Único escritor de sequência; a função SQL e este lock usam a mesma chave. */
export async function recordRightsEvent(context, protocolId, code, counts = {}, { once = true } = {}) {
  return withRightsOperator(context.database, async () => {
    await context.database.query("SELECT pg_advisory_xact_lock(hashtextextended('meumimo:t14:rights:'||$1::text,0))", [protocolId]);
    const prior = (await context.database.query(`SELECT sequence,code,"countsJson" FROM app."DataRightsEvent"
      WHERE "protocolId"=$1 ORDER BY sequence DESC`, [protocolId])).rows;
    if (once && prior.some(row => row.code === code)) return;
    if (prior[0]?.code === code && JSON.stringify(prior[0].countsJson) === JSON.stringify(counts)) return;
    await context.database.query(`INSERT INTO app."DataRightsEvent"(id,"protocolId",sequence,code,"countsJson") VALUES($1,$2,$3,$4,$5)`,
      [randomUUID(), protocolId, (prior[0]?.sequence ?? 0) + 1, code, JSON.stringify(counts)]);
  });
}

export async function protocolEvents(context, protocolId) {
  return (await context.database.query(`SELECT code,"createdAt","countsJson" FROM app."DataRightsEvent"
    WHERE "protocolId"=$1 ORDER BY sequence`, [protocolId])).rows;
}
