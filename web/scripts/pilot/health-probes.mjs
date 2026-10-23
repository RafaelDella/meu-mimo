import path from 'node:path';
import { lstat } from 'node:fs/promises';
import pg from 'pg';
import { assertPilotDatabase, assertPilotRuntime } from './runtime-environment.mjs';
import { applicationMetadata } from './backup-source.mjs';

const fail = code => Object.assign(new Error(code), { code });
const abort = signal => signal?.throwIfAborted();
export async function withProbeClient(connectionString, signal, operation) {
  abort(signal);
  const client = new pg.Client({ connectionString, application_name: 'meumimo-local-health',
    connectionTimeoutMillis: 5_000, statement_timeout: 5_000, query_timeout: 5_000 });
  let disconnected = false;
  client.on('error', () => { disconnected = true; });
  const close = () => { void Promise.resolve(client.end()).catch(() => {}); };
  signal?.addEventListener('abort', close, { once: true });
  try {
    await client.connect(); abort(signal); const result = await operation(client);
    if (disconnected) throw fail('DATABASE_UNAVAILABLE'); return result;
  }
  finally { signal?.removeEventListener('abort', close); await client.end(); }
}

async function minimalJson(state, route, { body, signal } = {}) {
  abort(signal);
  const token = state.integration.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof token !== 'string' || !token) throw fail('SETUP_REQUIRED');
  const response = await fetch(`http://127.0.0.1:54321${route}`, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
    headers: { apikey: token, Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    if (!response.ok) throw fail('STACK_UNAVAILABLE');
    let bytes = 0; const parts = [];
    for await (const chunk of response.body) {
      bytes += chunk.length; if (bytes > 256 * 1024) throw fail('STACK_UNAVAILABLE'); parts.push(chunk);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally { await response.body?.cancel().catch(() => {}); }
}

function age(value, now) {
  if (value === null || value === undefined) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || time > now.getTime()) throw fail('DATABASE_UNAVAILABLE');
  return now.getTime() - time;
}

async function runtimeDatabase(runtime, signal) {
  assertPilotRuntime(runtime, 'development');
  return withProbeClient(runtime.DATABASE_URL, signal, async client => {
    const value = (await client.query(`SELECT 1 AS ok,current_database() AS database,current_user AS role,
      rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`)).rows[0];
    if (value?.ok !== 1 || value.database !== 'meumimo_t14_dev' || value.role !== 'meumimo_runtime'
      || value.rolsuper || value.rolcreatedb || value.rolcreaterole || value.rolbypassrls) throw fail('DATABASE_UNAVAILABLE');
  });
}

async function pendingAges(state, signal) {
  assertPilotDatabase(state.migration.development, 'development');
  return withProbeClient(state.migration.development, signal, async client => {
    const row = (await client.query(`SELECT clock_timestamp() AS observed,
      (SELECT min("createdAt") FROM app."OutboxEvent" WHERE "processedAt" IS NULL) AS outbox,
      (SELECT min("createdAt") FROM app."MediaAsset" WHERE "removedAt" IS NULL AND state IN ('QUEUED','PROCESSING')) AS media,
      (SELECT min(a."removedAt") FROM app."MediaAsset" a JOIN app."MediaCollection" c ON c.id=a."collectionId"
        WHERE a."removedAt" IS NOT NULL AND a."purgedAt" IS NULL AND NOT c."retentionHold"
        AND (a."leaseUntil" IS NULL OR a."leaseUntil"<=clock_timestamp())) AS purge`)).rows[0];
    const observed = new Date(row.observed);
    if (!Number.isFinite(observed.getTime())) throw fail('DATABASE_UNAVAILABLE');
    return Object.fromEntries(['outbox', 'media', 'purge'].map(key => [key, age(row[key], observed)]));
  });
}

export async function probeDependencies({ state, runtime, signal, includeNext = true }) {
  const components = { postgres: 'unavailable', auth: 'unavailable', storage: 'unavailable', next: 'not_checked' };
  const codes = []; let agesMs = { outbox: null, media: null, purge: null };
  const tasks = [
    (async () => {
      try { await runtimeDatabase(runtime, signal); agesMs = await pendingAges(state, signal); components.postgres = 'ready'; }
      catch { codes.push('DATABASE_UNAVAILABLE'); }
    })(),
    (async () => {
      try {
        const value = await minimalJson(state, '/auth/v1/admin/users?page=1&per_page=1', { signal });
        if (!Array.isArray(value.users) || value.users.length > 1) throw fail('AUTH_UNAVAILABLE');
        components.auth = 'ready';
      } catch { codes.push('AUTH_UNAVAILABLE'); }
    })(),
    (async () => {
      try {
        if (state.media?.bucket !== 'meumimo-t06-private') throw fail('SETUP_REQUIRED');
        const bucket = await minimalJson(state, '/storage/v1/bucket/meumimo-t06-private', { signal });
        if (bucket.id !== 'meumimo-t06-private' || bucket.public !== false) throw fail('STORAGE_UNAVAILABLE');
        const objects = await minimalJson(state, '/storage/v1/object/list/meumimo-t06-private', {
          body: { prefix: 't14-development', limit: 1, offset: 0 }, signal });
        if (!Array.isArray(objects) || objects.length > 1) throw fail('STORAGE_UNAVAILABLE');
        components.storage = 'ready';
      } catch { codes.push('STORAGE_UNAVAILABLE'); }
    })(),
  ];
  if (includeNext) tasks.push((async () => {
    try {
      const response = await fetch('http://127.0.0.1:4301/conta', { redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000) });
      try { if (!response.ok) throw fail('NEXT_UNAVAILABLE'); components.next = 'ready'; }
      finally { await response.body?.cancel(); }
    } catch { codes.push('NEXT_UNAVAILABLE'); components.next = 'unavailable'; }
  })());
  await Promise.all(tasks); abort(signal);
  return { components, codes, agesMs };
}

export async function verifyDevelopment(state, runtime, signal) {
  await runtimeDatabase(runtime, signal);
  const application = await applicationMetadata();
  assertPilotDatabase(state.migration.development, 'development');
  await withProbeClient(state.migration.development, signal, async client => {
    const migrations = (await client.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM app._prisma_migrations ORDER BY migration_name')).rows;
    if (migrations.some(row => !row.finished_at || row.rolled_back_at)
      || JSON.stringify(migrations.map(row => ({ name: row.migration_name, sha256: row.checksum }))) !== JSON.stringify(application.migrationChecksums)) throw fail('SETUP_REQUIRED');
    const flags = (await client.query(`SELECT has_schema_privilege('meumimo_runtime','app','CREATE') AS create,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='app' AND c.relkind='r' AND c.relname<>'_prisma_migrations' AND NOT c.relrowsecurity) AS unprotected`)).rows[0];
    if (flags.create || flags.unprotected) throw fail('SETUP_REQUIRED');
  });
  for (const [name, file] of [['ffmpeg', state.media?.ffmpeg], ['ffprobe', state.media?.ffprobe]]) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || ![name, `${name}.exe`].includes(path.basename(file).toLowerCase())) throw fail('SETUP_REQUIRED');
    const entry = await lstat(file); if (!entry.isFile() || entry.isSymbolicLink()) throw fail('SETUP_REQUIRED');
  }
  return application.applicationBuildId;
}
