import path from 'node:path';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { pilotResources } from './resources.mjs';
import { applyJournal } from './journal.mjs';
import { writePrivateJson, ensurePrivateDirectory } from './custody.mjs';
import { financialFingerprints } from './backup-consistency.mjs';

const identifier = name => `"${name.replaceAll('"', '""')}"`;
const target = pilotResources('restore');
async function verifyRestoredPermissions(client) {
  const roles = await client.query(`SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname='meumimo_runtime'`);
  if (roles.rowCount !== 1 || Object.values(roles.rows[0]).some(Boolean)) throw new Error('Papel runtime da cópia está privilegiado.');
  const schema = await client.query(`SELECT has_schema_privilege('meumimo_runtime','app','CREATE') AS allowed`);
  if (schema.rows[0].allowed) throw new Error('Runtime da cópia pode criar estrutura.');
  const guards = await client.query(`SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app'
      AND c.relkind='r' AND c.relname<>'_prisma_migrations' AND NOT c.relrowsecurity)::int AS unprotected,
    (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='app' AND t.tgenabled='D')::int AS disabled`);
  if (guards.rows[0].unprotected || guards.rows[0].disabled) throw new Error('RLS ou triggers da cópia estão incompletos.');
  for (const table of ['PointsEntry', 'RedemptionEvent', 'SubmissionReviewEvent', 'DataRightsProtocol', 'DataRightsEvent', 'DataSuppression']) {
    const access = await client.query(`SELECT has_table_privilege('meumimo_runtime',$1,$2) AS allowed`,
      [`app."${table}"`, table.startsWith('Data') ? 'INSERT,UPDATE,DELETE' : 'UPDATE,DELETE']);
    if (access.rows[0].allowed) throw new Error('Runtime da cópia altera registros protegidos.');
  }
}

export function restoreClient(context, database = 'postgres', initial = false) {
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('Banco copiado inválido.');
  const source = context.configuration.containers.find(item => item.service === 'db').config.Env;
  const env = Object.fromEntries(source.map(item => { const split = item.indexOf('='); return [item.slice(0, split), item.slice(split + 1)]; }));
  return new pg.Client({ host: '127.0.0.1', port: target.dbPort, database, user: env.POSTGRES_USER ?? 'postgres',
    password: initial ? env.POSTGRES_PASSWORD : context.secrets.postgres,
    application_name: 'meumimo-local-restore', connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });
}

export async function prepareRestoredDatabase(context, journal) {
  const admin = restoreClient(context, 'postgres', true);
  await admin.connect();
  try {
    const source = context.manifest.sourceDatabase;
    if (source !== target.database) {
      const names = await admin.query('SELECT datname FROM pg_database WHERE datname = ANY($1)', [[target.database, `${target.database}_captured`, source]]);
      const existing = new Set(names.rows.map(row => row.datname));
      if (existing.has(`${target.database}_captured`) || !existing.has(source)) throw new Error('Renomeação isolada não é segura.');
      if (existing.has(target.database)) await admin.query(`ALTER DATABASE ${identifier(target.database)} RENAME TO ${identifier(`${target.database}_captured`)}`);
      await admin.query(`ALTER DATABASE ${identifier(source)} RENAME TO ${identifier(target.database)}`);
    }
    const roles = await admin.query('SELECT rolname FROM pg_roles WHERE rolcanlogin ORDER BY rolname');
    for (const { rolname } of roles.rows) {
      const password = rolname === 'meumimo_runtime' ? context.secrets.runtime :
        ['postgres', admin.user].includes(rolname) ? context.secrets.postgres : randomBytes(32).toString('hex');
      context.secrets.passwords[rolname] = password;
      await admin.query(`ALTER ROLE ${identifier(rolname)} PASSWORD '${password}'`);
    }
    await admin.query(`ALTER DATABASE postgres SET "app.settings.jwt_secret" TO '${context.secrets.jwt}'`);
    // Confirmed transient Auth tables; session deletion also cascades mfa_amr_claims.
    // Factors and identities remain available only to fresh authentication.
    for (const table of ['flow_state', 'mfa_challenges', 'one_time_tokens', 'refresh_tokens', 'sessions']) {
      const exists = await admin.query('SELECT to_regclass($1) AS name', [`auth.${table}`]);
      if (exists.rows[0].name) await admin.query(`DELETE FROM auth.${table}`);
    }
    const columns = await admin.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='auth' AND table_name='users'
      AND column_name = ANY($1)`, [['confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'phone_change_token', 'reauthentication_token']]);
    if (columns.rowCount) await admin.query(`UPDATE auth.users SET ${columns.rows.map(row => `${identifier(row.column_name)}=''`).join(',')}`);
    const databases = await admin.query(`SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname`);
    let applied = 0; let pending = 0;
    for (const { datname } of databases.rows) {
      if (!/^meumimo_t\d\d(?:_dev|_shadow|_captured)?$/.test(datname)) continue;
      const client = restoreClient(context, datname);
      await client.connect();
      try {
        if (datname === target.database) {
          await verifyRestoredPermissions(client);
          await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          const current = await financialFingerprints(client);
          await client.query('COMMIT');
          if (JSON.stringify(current) !== JSON.stringify(context.manifest.fingerprints)) throw new Error('Reconciliação financeira da cópia divergiu.');
          const migrations = await client.query('SELECT migration_name,checksum FROM app._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name');
          if (JSON.stringify(migrations.rows.map(row => ({ name: row.migration_name, sha256: row.checksum }))) !== JSON.stringify(context.manifest.databaseMigrations)) throw new Error('Migrações da cópia divergiram.');
        }
        const tables = await client.query(`SELECT to_regclass('app."AuthSession"') AS sessions, to_regclass('app."AdminGrant"') AS grants,
          to_regclass('app."DataRightsProtocol"') AS rights, to_regclass('app."MediaAsset"') AS media`);
        if (tables.rows[0].sessions) await client.query(`UPDATE app."AuthSession" SET "revokedAt"=clock_timestamp() WHERE "revokedAt" IS NULL`);
        if (tables.rows[0].grants) await client.query(`UPDATE app."AdminGrant" SET "revokedAt"=clock_timestamp() WHERE "revokedAt" IS NULL`);
        if (tables.rows[0].rights) {
          const sourceDatabase = datname === target.database ? source : datname === `${target.database}_captured` ? target.database : datname;
          const result = await applyJournal({ client, database: datname, sourceDatabase, entries: journal.entries, mode: 'restore' });
          applied += result.applied; pending += result.pending;
        } else if (journal.entries.some(entry => entry.database === datname)) throw new Error('Banco do journal sem suporte de supressão.');
        if (tables.rows[0].media) {
          // Hide all elapsed D08 categories before publishing services; retained bytes stay quarantined.
          // Old lease ownership is invalid in this stack, but leaseUntil still protects late-write cleanup.
          await client.query(`WITH cut AS MATERIALIZED (SELECT clock_timestamp() AS now)
            UPDATE app."MediaAsset" AS asset SET state='REMOVING', "removedAt"=cut.now,
              "availableAt"=cut.now, "leaseToken"=NULL
            FROM app."MediaCollection" collection CROSS JOIN cut
            WHERE collection.id=asset."collectionId" AND asset."removedAt" IS NULL AND (
              (asset."publishedAt" IS NULL AND asset."lastActivityAt"<=cut.now-interval '24 hours') OR
              (asset."publishedAt" IS NOT NULL AND NOT collection."retentionHold" AND (
                (collection.purpose='EVIDENCE' AND asset."publishedAt"<=cut.now-interval '180 days') OR
                (collection.purpose='MEMORY' AND collection."retentionUntil"<=cut.now))))`);
        }
      } finally { await client.end(); }
    }
    const subjects = [...new Set(journal.entries.map(entry => entry.subjectProfileId))];
    if (subjects.length) await admin.query('DELETE FROM auth.users WHERE id=ANY($1::uuid[])', [subjects]);
    return { applied, pending };
  } finally { await admin.end(); }
}

export async function writeRestoreState(context) {
  const directory = target.directory;
  await ensurePrivateDirectory(directory); await ensurePrivateDirectory(path.join(directory, 'temp'));
  const url = (user, password, database, schema = false) => `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${target.dbPort}/${database}${schema ? '?schema=app' : ''}`;
  const runtimeURL = url('meumimo_runtime', context.secrets.runtime, target.database, true);
  const administrator = url('postgres', context.secrets.postgres, target.database, true);
  const auth = url('postgres', context.secrets.postgres, 'postgres');
  const state = {
    runtime: { APP_ORIGIN: `http://127.0.0.1:${target.nextPort}`, SUPABASE_URL: `http://127.0.0.1:${target.apiPort}`,
      SUPABASE_PUBLISHABLE_KEY: context.secrets.anon, DATABASE_URL: runtimeURL, AUTH_RATE_LIMIT_SECRET: context.secrets.authRate,
      MEDIA_GATEWAY_URL: `http://127.0.0.1:${target.mediaPort}`, MEDIA_INTERNAL_SECRET: context.secrets.gateway,
      PILOT_MODE: 'restore', PILOT_PROJECT_ID: target.project, PILOT_DIRECTORY: directory,
      MEDIA_PREFIX: target.mediaPrefix, MEDIA_TEMP_DIR: path.join(directory, 'temp') },
    integration: { T02_PROJECT_ID: target.project, SUPABASE_URL: `http://127.0.0.1:${target.apiPort}`,
      T02_DATABASE_URL: administrator, T02_AUTH_DATABASE_URL: auth, T02_TASK: 't14',
      T02_TEST_ORIGIN: `http://127.0.0.1:${target.nextPort}`, T02_MAIL_URL: `http://127.0.0.1:${target.mailPort}`,
      SUPABASE_SERVICE_ROLE_KEY: context.secrets.service },
    migration: { integration: administrator }, media: context.configuration.sourceState.media,
    restore: { formatVersion: 1, owner: context.owner, backupId: context.manifest.id, status: 'VERIFIED' },
  };
  await writePrivateJson(path.join(directory, 'integration.json'), state, { exclusive: true });
  await writePrivateJson(path.join(directory, 'secrets.json'), context.secrets, { exclusive: true });
  return state;
}
