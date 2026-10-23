import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readState } from '../local-runtime.mjs';
import { backupEngine, containerRoute } from './backup-streams.mjs';
import { sourceServices, webRoot } from './backup-source.mjs';
import { custodyRoot, ensurePrivateDirectory, readPrivateJson, writePrivateJson, withMaintenanceLock } from './custody.mjs';

const project = 'meumimo-t02';
const network = `supabase_network_${project}`;
const filename = path.join(custodyRoot, 'source-inventory.json');
const services = ['db', 'inbucket', 'auth', 'rest', 'realtime', 'storage', 'kong'];
const ports = { db: ['5432/tcp', '54322'], inbucket: ['8025/tcp', '54324'], kong: ['8000/tcp', '54321'] };
const destinations = { db: '/var/lib/postgresql/data', storage: '/mnt' };
const invalid = () => Object.assign(new Error('Inventário da origem local divergente ou indisponível; anterior preservado.'),
  { code: 'T14_SOURCE_INVENTORY_INVALID' });
const normalized = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const ownObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function array(value) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw invalid();
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!ownObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function signature(container) {
  const labels = container.Config.Labels;
  return JSON.stringify(canonical({
    name: container.Name, image: container.Image,
    project: labels['com.supabase.cli.project'], compose: labels['com.docker.compose.project'],
    workdir: normalized(labels['com.supabase.cli.workdir']), network: container.HostConfig.NetworkMode,
    mounts: [...array(container.Mounts)].sort((a, b) => a.Destination.localeCompare(b.Destination)),
    binds: [...array(container.HostConfig.Binds)].sort(),
    hostMounts: array(container.HostConfig.Mounts), tmpfs: container.HostConfig.Tmpfs ?? {},
    bindings: container.HostConfig.PortBindings ?? {},
  }));
}

function validatePorts(container, service) {
  const configured = container.HostConfig.PortBindings ?? {};
  const observed = container.NetworkSettings.Ports;
  if (!ownObject(configured) || !ownObject(observed) || container.HostConfig.PublishAllPorts) throw invalid();
  const expected = ports[service];
  const keys = Object.keys(configured);
  if (expected ? keys.length !== 1 || keys[0] !== expected[0] : keys.length !== 0) throw invalid();
  const published = [];
  for (const [port, entries] of Object.entries(observed)) {
    for (const entry of array(entries)) published.push({ ...entry, port });
  }
  const validBinding = entry => ownObject(entry) && entry.HostIp === '127.0.0.1' && entry.HostPort === expected?.[1];
  if (!expected) {
    if (published.length) throw invalid();
  } else {
    const entries = array(configured[expected[0]]);
    if (entries.length !== 1 || !validBinding(entries[0]) || published.length !== 1 ||
        published[0].port !== expected[0] || !validBinding(published[0])) throw invalid();
  }
}

function validateMounts(container, service) {
  const mounts = array(container.Mounts); const binds = array(container.HostConfig.Binds);
  const destination = destinations[service]; const name = `supabase_${service}_${project}`;
  if (array(container.HostConfig.Mounts).length || Object.keys(container.HostConfig.Tmpfs ?? {}).length ||
      array(container.HostConfig.VolumesFrom).length) throw invalid();
  if (!destination) {
    if (mounts.length || binds.length) throw invalid();
    return;
  }
  const mount = mounts[0];
  if (mounts.length !== 1 || !ownObject(mount) || mount.Type !== 'volume' || mount.Name !== name || mount.Destination !== destination ||
      mount.RW !== true || mount.Driver !== 'local' || typeof mount.Source !== 'string' || !path.posix.isAbsolute(mount.Source) ||
      binds.length !== 1 || ![`${name}:${destination}`, `${name}:${destination}:rw`].includes(binds[0])) throw invalid();
}

function validateContainer(container, service, healthy) {
  const labels = container?.Config?.Labels;
  const host = container?.HostConfig;
  const networks = container?.NetworkSettings?.Networks;
  if (container?.Name !== `/supabase_${service}_${project}` || !/^[a-f0-9]{64}$/.test(container?.Id ?? '') ||
      !/^sha256:[a-f0-9]{64}$/.test(container?.Image ?? '') || !ownObject(labels) || !ownObject(host) ||
      labels['com.supabase.cli.project'] !== project || labels['com.docker.compose.project'] !== project ||
      typeof labels['com.supabase.cli.workdir'] !== 'string' || !path.isAbsolute(labels['com.supabase.cli.workdir']) ||
      path.resolve(labels['com.supabase.cli.workdir']) !== path.resolve(webRoot) || host.NetworkMode !== network ||
      host.AutoRemove || host.Privileged || !ownObject(networks) || Object.keys(networks).join() !== network ||
      !/^[a-f0-9]{64}$/.test(networks[network]?.NetworkID ?? '')) throw invalid();
  validateMounts(container, service);
  validatePorts(container, service);
  if (healthy) {
    const state = container.State;
    const check = container.Config.Healthcheck?.Test;
    const configured = Array.isArray(check) && check.length && check[0] !== 'NONE';
    if (!state || state.Running !== true || state.Status !== 'running' || state.Paused || state.Restarting ||
        state.Dead || state.OOMKilled || state.Error || ((service !== 'rest' || configured || state.Health) && state.Health?.Status !== 'healthy')) throw invalid();
  }
  return container;
}

function orderedContainers(containers, healthy) {
  if (!Array.isArray(containers) || containers.length !== services.length ||
      [...sourceServices].sort().join() !== [...services].sort().join()) throw invalid();
  const ordered = services.map(service => {
    const found = containers.filter(container => container?.Name === `/supabase_${service}_${project}`);
    if (found.length !== 1) throw invalid();
    return validateContainer(found[0], service, healthy);
  });
  if (new Set(ordered.map(container => container.Id)).size !== services.length ||
      new Set(ordered.map(container => container.NetworkSettings.Networks[network].NetworkID)).size !== 1) throw invalid();
  return ordered;
}

/** Guard puro para a prova local; não recebe URL, credencial ou nomes alternativos. */
export function assertPilotSourceInventory(containers, previous) {
  const current = orderedContainers(containers, true);
  if (previous !== undefined) {
    if (!ownObject(previous) || (previous.project !== undefined && previous.project !== project) ||
        (previous.formatVersion !== undefined && previous.formatVersion !== 1)) throw invalid();
    const expected = orderedContainers(previous.containers, false);
    if (current.some((container, index) => signature(container) !== signature(expected[index]))) throw invalid();
  }
  return current;
}

function validateVersion(version) {
  if (version?.Os !== 'linux' || version.ApiVersion !== '1.56' || typeof version.Version !== 'string' || version.Version.length > 80 ||
      !/^\d+(?:\.\d+){1,3}(?:[-+.][a-zA-Z0-9._-]+)?$/.test(version.Version ?? '')) throw invalid();
  if (version.MinAPIVersion !== undefined) {
    if (!/^1\.\d+$/.test(version.MinAPIVersion) || Number(version.MinAPIVersion.split('.')[1]) > 56) throw invalid();
  }
}

async function previousInventory() {
  try { return { exists: true, value: await readPrivateJson(filename) }; }
  catch (error) { if (error.code === 'ENOENT') return { exists: false }; throw error; }
}

/** Descoberta somente leitura da stack já aprovada por local:prepare:t14. */
export async function preparePilotInventory() {
  if (arguments.length) throw invalid();
  return withMaintenanceLock(async () => {
    const state = readState('t14');
    if (state.integration.T02_PROJECT_ID !== project) throw invalid();
    await ensurePrivateDirectory(custodyRoot);
    const previous = await previousInventory();
    if (previous.exists) {
      if (!ownObject(previous.value)) throw invalid();
      orderedContainers(previous.value.containers, false);
    }
    const engine = await backupEngine();
    validateVersion(engine.version);
    const inspected = [];
    for (const service of services) inspected.push(await engine.request('GET', `/containers/supabase_${service}_${project}/json`));
    const current = assertPilotSourceInventory(inspected, previous.exists ? previous.value : undefined);
    const confirmed = [];
    for (const container of current) {
      const observed = await engine.request('GET', `${containerRoute(container.Id)}/json`);
      if (observed?.Id !== container.Id) throw invalid();
      confirmed.push(observed);
    }
    const containers = assertPilotSourceInventory(confirmed, { containers: current });
    const version = await engine.request('GET', '/version');
    validateVersion(version);
    if (version.Version !== engine.version.Version) throw invalid();
    const latest = await previousInventory();
    if (latest.exists !== previous.exists || (latest.exists && JSON.stringify(latest.value) !== JSON.stringify(previous.value))) throw invalid();
    const inventory = { ...(previous.value ?? {}), formatVersion: 1, project,
      capturedAt: new Date().toISOString(), version, containers };
    await writePrivateJson(filename, inventory);
    const priorIds = previous.exists ? new Set(previous.value.containers.map(container => container.Id)) : new Set();
    return { code: 'T14_SOURCE_INVENTORY_READY', containers: containers.length,
      refreshedIds: previous.exists ? containers.filter(container => !priorIds.has(container.Id)).length : 0,
      engineVersion: version.Version, apiVersion: version.ApiVersion };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw invalid();
    process.stdout.write(JSON.stringify(await preparePilotInventory()) + '\n');
  } catch {
    process.stderr.write('T14_SOURCE_INVENTORY_INVALID\n');
    process.exitCode = 1;
  }
}
