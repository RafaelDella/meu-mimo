import net from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { pilotResources } from './resources.mjs';
import { readPrivateJson } from './custody.mjs';
import { containerRoute } from './backup-streams.mjs';
import { financialFingerprints } from './backup-consistency.mjs';

export const sourceServices = ['db', 'inbucket', 'auth', 'rest', 'realtime', 'storage', 'kong'];
const stopOrder = ['kong', 'auth', 'rest', 'storage', 'realtime', 'inbucket', 'db'];
const project = 'meumimo-t02';
export const webRoot = fileURLToPath(new URL('../../', import.meta.url));
const root = pilotResources('integration').directory;
export const environment = container => Object.fromEntries((container.Config.Env ?? []).map(item => {
  const separator = item.indexOf('='); return [item.slice(0, separator), item.slice(separator + 1)];
}));

async function portOccupied(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = result => { socket.destroy(); resolve(result); };
    socket.once('connect', () => finish(true)); socket.once('error', error => finish(error.code !== 'ECONNREFUSED'));
    socket.setTimeout(1000, () => finish(true));
  });
}

export async function assertSourceWritersAbsent() {
  for (const port of [4301, 4302, 4303, 4310, 4311]) {
    if (await portOccupied(port)) throw new Error('Encerre os escritores locais identificados antes da manutenção.');
  }
  for (const name of ['supervisor.json', 'processes.json', 'local-handle.json']) {
    try {
      const state = await readPrivateJson(path.join(root, name));
      if (state.status !== 'stopped') throw new Error('Supervisor local precisa estar parado.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function assertContainer(container, service, expected) {
  const name = `supabase_${service}_${project}`;
  const labels = container?.Config?.Labels ?? {};
  if (container?.Name !== `/${name}` || !/^[a-f0-9]{64}$/.test(container?.Id ?? '')
    || !/^sha256:[a-f0-9]{64}$/.test(container.Image ?? '') || container.Image !== expected.Image
    || container.Id !== expected.Id || labels['com.supabase.cli.project'] !== project
    || labels['com.docker.compose.project'] !== project
    || path.resolve(labels['com.supabase.cli.workdir'] ?? '') !== path.resolve(webRoot)
    || container.HostConfig.NetworkMode !== `supabase_network_${project}` || container.HostConfig.AutoRemove
    || Object.keys(container.NetworkSettings.Networks ?? {}).join() !== `supabase_network_${project}`) {
    throw new Error('Inventário de origem divergente; nenhum volume foi alterado.');
  }
  const mounts = container.Mounts ?? [];
  const destination = service === 'db' ? '/var/lib/postgresql/data' : service === 'storage' ? '/mnt' : undefined;
  if (destination ? mounts.length !== 1 || mounts[0].Type !== 'volume' || mounts[0].Name !== name
    || mounts[0].Destination !== destination : mounts.length !== 0) throw new Error('Mount de origem não reconhecido.');
  for (const bindings of Object.values(container.HostConfig.PortBindings ?? {})) {
    if (bindings.some(binding => binding.HostIp !== '127.0.0.1')) throw new Error('Origem não está restrita ao loopback.');
  }
}

export async function inspectSource(engine) {
  const inventory = await readPrivateJson(path.join(root, 'source-inventory.json'));
  if (!Array.isArray(inventory.containers) || inventory.containers.length !== sourceServices.length) throw new Error('Inventário de origem ausente.');
  const snapshots = [];
  for (const service of sourceServices) {
    const expected = inventory.containers.find(item => item.Name === `/supabase_${service}_${project}`);
    if (!expected) throw new Error('Serviço ausente do inventário de origem.');
    const current = await engine.request('GET', `${containerRoute(expected.Id)}/json`);
    assertContainer(current, service, expected);
    if (!current.State.Running || current.State.Health?.Status === 'unhealthy') throw new Error('A origem precisa estar saudável antes da captura.');
    snapshots.push({ service, container: current });
  }
  return snapshots;
}

export function sourceClient(snapshots, database = 'postgres') {
  if (!/^(postgres|meumimo_t\d\d(?:_dev|_shadow)?)$/.test(database)) throw new Error('Banco de origem inválido.');
  const env = environment(snapshots.find(item => item.service === 'db').container);
  if (!env.POSTGRES_PASSWORD) throw new Error('Credencial de captura indisponível.');
  return new pg.Client({ host: '127.0.0.1', port: 54322, database,
    user: env.POSTGRES_USER ?? 'postgres', password: env.POSTGRES_PASSWORD, application_name: 'meumimo-local-backup',
    connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
}

export async function stopSource(engine, snapshots, stopped) {
  for (const service of stopOrder) {
    if (service === 'db') await assertQuiescent(snapshots);
    const item = snapshots.find(value => value.service === service);
    stopped.push(item);
    await engine.stop(item.container.Id);
    const observed = await engine.request('GET', `${containerRoute(item.container.Id)}/json`);
    if (observed.State.Running || (service === 'db' && observed.State.ExitCode !== 0)
      || observed.State.OOMKilled) throw new Error('A parada limpa da origem não foi confirmada.');
  }
}

export async function restartSource(engine, stopped) {
  const failures = [];
  for (const item of [...stopped].reverse()) {
    try {
      const before = await engine.request('GET', `${containerRoute(item.container.Id)}/json`);
      if (before.Name !== item.container.Name || before.Image !== item.container.Image) throw new Error('Identidade alterada.');
      if (!before.State.Running) await engine.request('POST', `${containerRoute(item.container.Id)}/start`);
      else if (before.State.Status !== 'running') throw new Error('Parada ainda pendente.');
      const deadline = Date.now() + 90_000;
      let ready = false;
      while (Date.now() < deadline) {
        const current = await engine.request('GET', `${containerRoute(item.container.Id)}/json`);
        if (!current.State.Running || current.State.Health?.Status === 'unhealthy') throw new Error('Origem não retomou saúde.');
        if (!current.State.Health || current.State.Health.Status === 'healthy') { ready = true; break; }
        await delay(500);
      }
      if (!ready) throw new Error('Retomada da origem excedeu o prazo.');
    } catch { failures.push(item.service); }
  }
  if (failures.length) throw Object.assign(new Error('Reabertura da origem pendente; confira os serviços locais.'), { code: 'SOURCE_RESTART_PENDING' });
}

export async function sourceMetadata(mode, snapshots) {
  const resources = pilotResources(mode);
  const client = sourceClient(snapshots, resources.database);
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const leases = await client.query(`SELECT count(*)::int AS count FROM app."MediaAsset" WHERE "leaseUntil" > now()`);
    if (leases.rows[0].count) throw new Error('Há leases de mídia ativas; aguarde antes da captura.');
    const migrations = await client.query('SELECT migration_name, checksum, finished_at FROM app._prisma_migrations ORDER BY migration_name');
    if (!migrations.rows.length || migrations.rows.some(row => !row.finished_at)) throw new Error('Migrações incompletas na origem.');
    const fingerprints = await financialFingerprints(client);
    await client.query('COMMIT');
    return { migrations: migrations.rows.map(row => ({ name: row.migration_name, sha256: row.checksum })),
      fingerprints, counts: { migrations: migrations.rowCount } };
  } finally { await client.end(); }
}

export async function assertQuiescent(snapshots) {
  const client = sourceClient(snapshots);
  await client.connect();
  try {
    const result = await client.query(`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE pid <> pg_backend_pid() AND backend_type='client backend'`);
    if (result.rows[0].count) throw new Error('Conexões de origem permanecem abertas; captura recusada.');
  } finally { await client.end(); }
}

export async function applicationMetadata() {
  const git = path.resolve(webRoot, '../.git');
  if (!(await lstat(git)).isDirectory()) throw new Error('Metadados da aplicação indisponíveis.');
  const head = (await readFile(path.join(git, 'HEAD'), 'utf8')).trim();
  let applicationSha = head;
  if (head.startsWith('ref: ')) {
    const reference = head.slice(5);
    if (!/^refs\/[a-zA-Z0-9_./-]+$/.test(reference) || reference.split('/').includes('..')) throw new Error('Referência da aplicação inválida.');
    try { applicationSha = (await readFile(path.join(git, reference), 'utf8')).trim(); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const packed = await readFile(path.join(git, 'packed-refs'), 'utf8');
      applicationSha = packed.split('\n').find(line => line.endsWith(` ${reference}`))?.split(' ')[0];
    }
  }
  if (!/^[a-f0-9]{40}$/.test(applicationSha ?? '')) throw new Error('SHA da aplicação indisponível.');
  const migrationChecksums = [];
  const directory = path.join(webRoot, 'prisma/migrations');
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name, 'migration.sql');
    if (!(await lstat(file)).isFile() || (await lstat(file)).isSymbolicLink()) throw new Error('Migração não regular.');
    migrationChecksums.push({ name: entry.name, sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
  }
  const applicationBuildId = (await readFile(path.join(webRoot, '.next/BUILD_ID'), 'utf8')).trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(applicationBuildId)) throw new Error('Build de produção indisponível para a captura.');
  return { applicationSha, applicationBuildId, migrationChecksums: migrationChecksums.sort((a, b) => a.name.localeCompare(b.name)) };
}
