import net from 'node:net';
import path from 'node:path';
import { lstat, readdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { custodyRoot, ensurePrivateDirectory, readPrivateJson, writePrivateJson, withMaintenanceLock } from './custody.mjs';
import { backupEngine, containerRoute } from './backup-streams.mjs';
import { sourceServices, webRoot } from './backup-source.mjs';
import { restoreName, restoreNetwork } from './restore-secrets.mjs';
import { pilotResources } from './resources.mjs';
import { assertPilotRuntime } from './runtime-environment.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ID = /^[a-f0-9]{64}$/;
const project = 'meumimo-t14-restore';
const marker = 'dev.meumimo.restore-owner';
const directory = pilotResources('restore').directory;
const history = path.join(custodyRoot, 'restore-history');
const volumeNames = ['db', 'storage'].map(restoreName);
const ports = { db: ['5432/tcp', '55322'], kong: ['8000/tcp', '55321'], inbucket: ['8025/tcp', '55324'] };
const refuse = () => Object.assign(new Error('Limpeza de recuperação recusada; confira a posse e o escopo locais.'), { code: 'RESTORE_CLEANUP_REFUSED' });
const same = (left, right) => left.dev === right.dev && left.ino === right.ino;
const canonical = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);

async function metadata(filename) {
  try { return await lstat(filename, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function assertPaths(destination) {
  for (const value of [directory, history, destination]) {
    const relative = path.relative(custodyRoot, value);
    if (!path.isAbsolute(value) || !relative || relative === '..' || relative.startsWith(`..${path.sep}`)
      || path.isAbsolute(relative)) throw refuse();
  }
  if (path.dirname(directory) !== custodyRoot || path.dirname(destination) !== history) throw refuse();
}

async function regularTree(root) {
  const pending = [root]; let entries = 0;
  while (pending.length) {
    const current = pending.pop(); const observed = await lstat(current, { bigint: true });
    if (!observed.isDirectory() || observed.isSymbolicLink()) throw refuse();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (++entries > 10_000 || entry.isSymbolicLink()) throw refuse();
      if (current === root && !['operation.json', 'integration.json', 'secrets.json', 'temp'].includes(entry.name)) throw refuse();
      const filename = path.join(current, entry.name); const stat = await lstat(filename, { bigint: true });
      if (stat.isSymbolicLink()) throw refuse();
      if (stat.isDirectory() && (current !== root || entry.name === 'temp')) pending.push(filename);
      else if (!stat.isFile() || stat.nlink !== 1n || (current === root && entry.name === 'temp')) throw refuse();
    }
  }
}

function containerIds(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(service => !sourceServices.includes(service))
    || Object.values(value).some(id => typeof id !== 'string' || !ID.test(id))
    || new Set(Object.values(value)).size !== Object.keys(value).length) throw refuse();
  return value;
}

function assertOperation(operation, owner) {
  if (operation?.formatVersion !== 1 || operation.owner !== owner || !UUID.test(operation.backupId ?? '')
    || !['CLOSED', 'VERIFIED', 'CLEANED'].includes(operation.status)
    || !Number.isFinite(Date.parse(operation.startedAt))
    || Object.keys(operation).some(key => !['formatVersion', 'owner', 'backupId', 'status', 'startedAt', 'completedAt', 'containers', 'cleanup'].includes(key))) throw refuse();
  containerIds(operation.containers);
  const previous = operation.cleanup;
  if (previous && (previous.formatVersion !== 1 || previous.owner !== owner || previous.backupId !== operation.backupId
    || !['IN_PROGRESS', 'CLEANED'].includes(previous.status) || !Array.isArray(previous.volumes)
    || !previous.containers || !Number.isFinite(Date.parse(previous.startedAt))
    || Object.keys(previous).some(key => !['formatVersion', 'owner', 'backupId', 'status', 'startedAt', 'completedAt', 'containers', 'volumes', 'networkId'].includes(key))
    || previous.volumes.some(name => !volumeNames.includes(name)) || new Set(previous.volumes).size !== previous.volumes.length
    || (previous.networkId !== null && !ID.test(previous.networkId ?? '')))) throw refuse();
  if (previous) {
    containerIds(previous.containers);
    for (const [service, id] of Object.entries(previous.containers)) if (operation.containers?.[service] !== id) throw refuse();
  }
}

async function readOperation(location, owner) {
  await regularTree(location);
  const operation = await readPrivateJson(path.join(location, 'operation.json'));
  assertOperation(operation, owner);
  if (await metadata(path.join(location, 'integration.json'))) {
    const state = await readPrivateJson(path.join(location, 'integration.json'));
    if (state.restore?.owner !== owner || state.restore.backupId !== operation.backupId) throw refuse();
    assertPilotRuntime(state.runtime, 'restore');
  }
  return operation;
}

function labels(value, owner) {
  if (value?.[marker] !== owner || value['com.supabase.cli.project'] !== project
    || value['com.docker.compose.project'] !== project || typeof value['com.supabase.cli.workdir'] !== 'string'
    || !path.isAbsolute(value['com.supabase.cli.workdir']) || canonical(value['com.supabase.cli.workdir']) !== canonical(webRoot)) throw refuse();
}

function assertContainer(value, service, owner, network) {
  labels(value.Config?.Labels, owner);
  if (!ID.test(value.Id ?? '') || value.Name !== `/${restoreName(service)}` || !/^sha256:[a-f0-9]{64}$/.test(value.Image ?? '')
    || value.HostConfig?.NetworkMode !== restoreNetwork || value.HostConfig.AutoRemove || value.HostConfig.Privileged
    || (value.HostConfig.RestartPolicy?.Name ?? 'no') !== 'no' || (value.HostConfig.Binds ?? []).length
    || (value.HostConfig.VolumesFrom ?? []).length || (value.HostConfig.Links ?? []).length || (value.HostConfig.Devices ?? []).length
    || Object.values(value.HostConfig).some(item => typeof item === 'string' && item.startsWith('container:'))) throw refuse();
  const expected = service === 'db' ? '/var/lib/postgresql/data' : service === 'storage' ? '/mnt' : undefined;
  const mounts = value.Mounts ?? [];
  if (expected ? mounts.length !== 1 || mounts[0].Type !== 'volume' || mounts[0].Name !== restoreName(service)
    || mounts[0].Destination !== expected || mounts[0].RW !== true : mounts.length !== 0) throw refuse();
  const networks = value.NetworkSettings?.Networks ?? {};
  if (Object.keys(networks).some(name => name !== restoreNetwork) || (value.State?.Running && !network)
    || (value.State?.Running && networks[restoreNetwork]?.NetworkID !== network?.Id)
    || (network && networks[restoreNetwork]?.NetworkID && networks[restoreNetwork].NetworkID !== network.Id)) throw refuse();
  for (const [port, entries] of Object.entries(value.HostConfig.PortBindings ?? {})) {
    if (!ports[service] || port !== ports[service][0] || entries.length !== 1
      || entries[0].HostIp !== '127.0.0.1' || entries[0].HostPort !== ports[service][1]) throw refuse();
  }
}

const refersToContainer = (value, own) => {
  const token = value.replace(/^container:/, '').replace(/^\//, '').split(':')[0];
  return own.some(item => token === item.Name.slice(1) || (/^[a-f0-9]{1,64}$/.test(token) && item.Id.startsWith(token)));
};
const sharesVolume = (source, mountpoint) => {
  if (typeof source !== 'string' || !path.posix.isAbsolute(source)) return false;
  const normalized = path.posix.resolve(source);
  return normalized === mountpoint || normalized.startsWith(`${mountpoint}/`)
    || mountpoint.startsWith(normalized === '/' ? '/' : `${normalized}/`);
};

async function inspectPlan(engine, operation) {
  const owner = operation.owner;
  const related = value => value?.[marker] === owner || value?.['com.docker.compose.project'] === project
    || value?.['com.supabase.cli.project'] === project;
  const allNetworks = await engine.request('GET', '/networks');
  const allVolumes = await engine.request('GET', '/volumes');
  if (!Array.isArray(allNetworks) || !Array.isArray(allVolumes?.Volumes)
    || allNetworks.some(item => related(item.Labels) && item.Name !== restoreNetwork)
    || allVolumes.Volumes.some(item => related(item.Labels) && !volumeNames.includes(item.Name))) throw refuse();
  const network = await engine.request('GET', `/networks/${restoreNetwork}`, { missing: true });
  if (network) {
    labels(network.Labels, owner);
    if (!ID.test(network.Id ?? '') || network.Name !== restoreNetwork || network.Driver !== 'bridge'
      || network.Scope !== 'local' || network.Internal !== false || network.Ingress
      || (operation.cleanup && operation.cleanup.networkId !== network.Id)) throw refuse();
  }
  const volumes = [];
  for (const name of volumeNames) {
    const volume = await engine.request('GET', `/volumes/${name}`, { missing: true });
    if (!volume) continue;
    labels(volume.Labels, owner);
    if (volume.Name !== name || volume.Driver !== 'local' || volume.Scope !== 'local' || Object.keys(volume.Options ?? {}).length
      || typeof volume.Mountpoint !== 'string' || !path.posix.isAbsolute(volume.Mountpoint)
      || path.posix.normalize(volume.Mountpoint) !== volume.Mountpoint || !volume.Mountpoint.endsWith(`/${name}/_data`)
      || (operation.cleanup && !operation.cleanup.volumes.includes(name))) throw refuse();
    volumes.push(volume);
  }
  const containers = [];
  for (const service of sourceServices) {
    const expected = operation.containers?.[service];
    const byId = expected ? await engine.request('GET', `${containerRoute(expected)}/json`, { missing: true }) : null;
    const current = await engine.request('GET', `/containers/${restoreName(service)}/json`, { missing: true });
    if ((byId && (!current || current.Id !== byId.Id)) || (current && expected && current.Id !== expected)) throw refuse();
    if (!current) continue;
    if (operation.cleanup && !expected) throw refuse();
    assertContainer(current, service, owner, network);
    if ((current.Mounts ?? []).some(mount => !volumes.some(volume => volume.Name === mount.Name && volume.Mountpoint === mount.Source))) throw refuse();
    containers.push({ service, ...current });
  }
  const ownIds = new Set(containers.map(item => item.Id));
  const identities = Object.entries({ ...operation.containers, ...Object.fromEntries(containers.map(item => [item.service, item.Id])) })
    .map(([service, Id]) => ({ Id, Name: `/${restoreName(service)}` }));
  for (const [id, item] of Object.entries(network?.Containers ?? {})) {
    if (!ownIds.has(id) || !containers.some(container => container.Id === id && container.Name.slice(1) === item.Name?.replace(/^\//, ''))) throw refuse();
  }
  const list = await engine.request('GET', '/containers/json?all=1');
  if (!Array.isArray(list) || list.some(item => !ID.test(item.Id ?? ''))) throw refuse();
  for (const item of list) {
    if (ownIds.has(item.Id)) continue;
    const foreign = await engine.request('GET', `${containerRoute(item.Id)}/json`);
    const config = foreign.HostConfig ?? {};
    if (foreign.Config?.Labels?.[marker] === owner || foreign.Config?.Labels?.['com.docker.compose.project'] === project
      || foreign.Config?.Labels?.['com.supabase.cli.project'] === project
      || config.NetworkMode === restoreNetwork || Object.hasOwn(foreign.NetworkSettings?.Networks ?? {}, restoreNetwork)
      || Object.values(config).some(value => typeof value === 'string' && value.startsWith('container:') && refersToContainer(value, identities))
      || [...(config.VolumesFrom ?? []), ...(config.Links ?? [])].some(value => refersToContainer(value, identities))
      || (config.Mounts ?? []).some(mount => (mount.Type === 'volume' && volumeNames.includes(mount.Source))
        || (mount.Type === 'bind' && volumes.some(volume => sharesVolume(mount.Source, volume.Mountpoint))))
      || (config.Binds ?? []).some(bind => volumes.some(volume => sharesVolume(bind.split(':')[0], volume.Mountpoint)))
      || (foreign.Mounts ?? []).some(mount => volumeNames.includes(mount.Name)
        || volumes.some(volume => sharesVolume(mount.Source, volume.Mountpoint)))) throw refuse();
  }
  if (operation.cleanup?.status === 'CLEANED' && (containers.length || volumes.length || network)) throw refuse();
  return { containers, volumes, network };
}

async function writersAbsent() {
  for (const port of [4320, 4321]) await new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', () => reject(refuse()));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

async function clean(owner) {
  const destination = path.join(history, owner); assertPaths(destination);
  const source = await metadata(directory); const archived = await metadata(destination);
  if ((!source && !archived) || (source && archived) || source?.isSymbolicLink() || archived?.isSymbolicLink()
    || (source && !source.isDirectory()) || (archived && !archived.isDirectory())) throw refuse();
  const location = source ? directory : destination;
  const operation = await readOperation(location, owner);
  if (!source && operation.cleanup?.status !== 'CLEANED') throw refuse();
  await writersAbsent();
  const engine = await backupEngine(); const plan = await inspectPlan(engine, operation);
  if (!source) return { owner, backupId: operation.backupId, status: 'CLEANED', archived: true, alreadyCleaned: true };
  if (await metadata(destination)) throw refuse();
  const historyStat = await metadata(history);
  if (historyStat && (!historyStat.isDirectory() || historyStat.isSymbolicLink())) throw refuse();
  await ensurePrivateDirectory(history);
  const ids = { ...operation.containers, ...Object.fromEntries(plan.containers.map(item => [item.service, item.Id])) };
  const cleanup = operation.cleanup ?? { formatVersion: 1, owner, backupId: operation.backupId, status: 'IN_PROGRESS',
    startedAt: new Date().toISOString(), containers: ids, volumes: plan.volumes.map(item => item.Name), networkId: plan.network?.Id ?? null };
  operation.containers = ids; operation.cleanup = cleanup;
  await writePrivateJson(path.join(directory, 'operation.json'), operation);
  for (const container of [...plan.containers].reverse()) if (container.State.Running) await engine.stop(container.Id);
  const stopped = await inspectPlan(engine, operation);
  if (stopped.containers.some(item => item.State.Running)) throw refuse();
  for (const container of stopped.containers) await engine.request('DELETE', `${containerRoute(container.Id)}?v=false&force=false`);
  for (const volume of stopped.volumes) {
    const current = await inspectPlan(engine, operation);
    if (current.containers.length) throw refuse();
    if (current.volumes.some(item => item.Name === volume.Name)) await engine.request('DELETE', `/volumes/${volume.Name}?force=false`);
  }
  const remaining = await inspectPlan(engine, operation);
  if (remaining.containers.length || remaining.volumes.length) throw refuse();
  if (remaining.network) await engine.request('DELETE', `/networks/${remaining.network.Id}`);
  const complete = await inspectPlan(engine, operation);
  if (complete.containers.length || complete.volumes.length || complete.network) throw refuse();
  cleanup.status = 'CLEANED'; cleanup.completedAt = new Date().toISOString(); operation.status = 'CLEANED';
  await writePrivateJson(path.join(directory, 'operation.json'), operation);
  await regularTree(directory);
  await ensurePrivateDirectory(history); await ensurePrivateDirectory(directory);
  if (!same(source, await lstat(directory, { bigint: true })) || await metadata(destination)) throw refuse();
  // Both directories are private and every authorized writer holds the same maintenance lock.
  await rename(directory, destination);
  if (!same(source, await lstat(destination, { bigint: true })) || await metadata(directory)) throw refuse();
  return { owner, backupId: operation.backupId, status: 'CLEANED', archived: true, alreadyCleaned: false,
    counts: { containers: Object.keys(cleanup.containers).length, volumes: cleanup.volumes.length, networks: cleanup.networkId ? 1 : 0 } };
}

export async function cleanRestore(ownerUUID) {
  if (typeof ownerUUID !== 'string' || !UUID.test(ownerUUID)) throw refuse();
  return withMaintenanceLock(() => clean(ownerUUID));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw refuse();
    process.stdout.write(`${JSON.stringify(await cleanRestore(process.argv[2]))}\n`);
  } catch { process.stderr.write('Limpeza da cópia de recuperação recusada; nenhum recurso desconhecido pode ser removido.\n'); process.exitCode = 1; }
}
