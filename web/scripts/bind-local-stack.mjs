import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { dockerEnvironment, webRoot } from './local-runtime.mjs';

const project = 'meumimo-t02';
const network = `supabase_network_${project}`;
const marker = 'dev.meumimo.loopback-transaction';
const definitions = [
  { service: 'db', port: '5432/tcp', hostPort: '54322',
    files: ['/etc/postgresql-custom/pgsodium_root.key'] },
  { service: 'kong', port: '8000/tcp', hostPort: '54321',
    files: ['/home/kong/kong.yml', '/home/kong/localhost.crt', '/home/kong/localhost.key'] },
  { service: 'inbucket', port: '8025/tcp', hostPort: '54324', files: [] },
];

export function localSocket() {
  const env = dockerEnvironment();
  const engine = process.platform === 'win32' ? 'docker.exe' : 'docker';
  const run = args => execFileSync(engine, args, {
    cwd: webRoot, env, encoding: 'utf8', windowsHide: true, timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
  }).trim();
  let endpoint;
  try {
    const context = env.DOCKER_CONTEXT || run(['context', 'show']);
    endpoint = !env.DOCKER_CONTEXT && env.DOCKER_HOST ? env.DOCKER_HOST :
      JSON.parse(run(['context', 'inspect', context, '--format', '{{json .Endpoints.docker.Host}}']));
  } catch {
    throw new Error('Não foi possível identificar o contexto Docker local.');
  }
  const pipePrefix = 'npipe:////./pipe/';
  if (typeof endpoint === 'string' && endpoint.startsWith(pipePrefix) &&
      /^[A-Za-z0-9_.-]+$/.test(endpoint.slice(pipePrefix.length))) {
    return `\\\\.\\pipe\\${endpoint.slice(pipePrefix.length)}`;
  }
  if (typeof endpoint === 'string' && endpoint.startsWith('unix:///') &&
      !endpoint.includes('\0')) return endpoint.slice('unix://'.length);
  throw new Error('O bind de T02 aceita somente um pipe ou socket Docker local.');
}

export function dockerApi(socketPath) {
  let prefix = '';
  async function request(method, route, { body, archive = false, missing = false } = {}) {
    const payload = body === undefined ? undefined :
      Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const fail = () => reject(new Error(`Falha na API Docker local (${method}).`));
      const req = http.request({ socketPath, method, path: `${prefix}${route}`,
        signal: AbortSignal.timeout(45000), headers: {
        ...(payload === undefined ? {} : {
          'Content-Type': Buffer.isBuffer(body) ? 'application/x-tar' : 'application/json',
          'Content-Length': payload.length,
        }),
      } }, response => {
        const chunks = [];
        let size = 0;
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 16 * 1024 * 1024) { response.destroy(); req.destroy(); fail(); }
          else chunks.push(chunk);
        });
        response.on('error', fail);
        response.on('end', () => {
          const bytes = Buffer.concat(chunks);
          if (missing && response.statusCode === 404) { resolve(null); return; }
          if (!((response.statusCode >= 200 && response.statusCode < 300) ||
              response.statusCode === 304)) {
            reject(new Error(`A API Docker local recusou ${method} (HTTP ${response.statusCode}).`));
            return;
          }
          try { resolve(archive ? bytes : bytes.length ? JSON.parse(bytes.toString('utf8')) : null); }
          catch { reject(new Error('Resposta inválida da API Docker local.')); }
        });
      });
      req.setTimeout(45000, () => { req.destroy(); fail(); });
      req.on('error', fail);
      req.end(payload);
    });
  }
  return {
    request,
    async connect() {
      const version = await request('GET', '/version');
      if (version?.Os !== 'linux' || !/^\d+\.\d+$/.test(version?.ApiVersion ?? '')) {
        throw new Error('É necessário um engine Docker Linux local válido.');
      }
      prefix = `/v${version.ApiVersion}`;
    },
  };
}

const containerRoute = id => `/containers/${encodeURIComponent(id)}`;
const inspect = (api, id, missing = false) => api('GET', `${containerRoute(id)}/json`, { missing });
const expectedName = definition => `supabase_${definition.service}_${project}`;
const normalizedPath = value => {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

function assertScope(container, definition) {
  const labels = container?.Config?.Labels ?? {};
  const bindings = container?.HostConfig?.PortBindings ?? {};
  const entries = bindings[definition.port];
  if (container?.Name !== `/${expectedName(definition)}` ||
      labels['com.supabase.cli.project'] !== project ||
      labels['com.docker.compose.project'] !== project ||
      typeof labels['com.supabase.cli.workdir'] !== 'string' ||
      normalizedPath(labels['com.supabase.cli.workdir']) !== normalizedPath(webRoot) ||
      container.HostConfig.NetworkMode !== network ||
      Object.keys(container.NetworkSettings?.Networks ?? {}).join() !== network ||
      Object.keys(bindings).join() !== definition.port || !Array.isArray(entries) || !entries.length ||
      entries.some(binding => binding.HostPort !== definition.hostPort) ||
      !/^sha256:[a-f0-9]{64}$/.test(container.Image ?? '') || container.HostConfig.AutoRemove) {
    throw new Error(`Configuração inesperada em ${expectedName(definition)}; nada foi alterado.`);
  }
  const mounts = container.Mounts ?? [];
  if (definition.service === 'db' ? mounts.length !== 1 || mounts[0].Type !== 'volume' ||
      mounts[0].Name !== `supabase_db_${project}` || mounts[0].Destination !== '/var/lib/postgresql/data' :
      mounts.length !== 0) throw new Error(`Mounts inesperados em ${expectedName(definition)}.`);
}

function assertPorts(container, definition) {
  const binding = container.HostConfig.PortBindings[definition.port];
  const published = Object.entries(container.NetworkSettings.Ports ?? {})
    .flatMap(([port, entries]) => (entries ?? []).map(entry => ({ port, ...entry })));
  if (binding.length !== 1 || binding[0].HostIp !== '127.0.0.1' ||
      published.length !== 1 || published[0].port !== definition.port ||
      published[0].HostIp !== '127.0.0.1' || published[0].HostPort !== definition.hostPort) {
    throw new Error(`O bind de ${expectedName(definition)} não ficou restrito a 127.0.0.1.`);
  }
}

async function healthy(api, id) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const container = await inspect(api, id);
    if (!container.State.Running || container.State.Health?.Status === 'unhealthy') {
      throw new Error('Um contêiner de T02 não iniciou com saúde.');
    }
    if (container.State.Health?.Status === 'healthy') return container;
    await delay(500);
  }
  throw new Error('Tempo esgotado ao verificar a saúde da stack T02.');
}

const mountSignature = container => JSON.stringify((container.Mounts ?? []).map(mount =>
  [mount.Type, mount.Name ?? '', mount.Source, mount.Destination, mount.RW]).sort());

function archiveDigest(bytes, filename) {
  let digest;
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim();
    if (!/^[0-7]+$/.test(sizeText)) throw new Error('Archive Docker interno inválido.');
    const size = Number.parseInt(sizeText, 8);
    if (!Number.isSafeInteger(size) || offset + 512 + size > bytes.length) {
      throw new Error('Archive Docker interno incompleto.');
    }
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    if ((header[156] === 0 || header[156] === 48) && name === path.posix.basename(filename)) {
      if (digest) throw new Error('Archive Docker interno ambíguo.');
      digest = createHash('sha256').update(bytes.subarray(offset + 512, offset + 512 + size)).digest();
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!digest) throw new Error('Arquivo interno regular ausente do archive Docker.');
  return digest;
}

function assertReplacement(container, original, definition) {
  assertScope(container, definition);
  assertPorts(container, definition);
  const aliases = container.NetworkSettings.Networks[network].Aliases ?? [];
  if (container.Image !== original.Image || mountSignature(container) !== mountSignature(original) ||
      (original.NetworkSettings.Networks[network].Aliases ?? []).some(alias => !aliases.includes(alias))) {
    throw new Error(`Imagem, mounts ou aliases divergiram em ${expectedName(definition)}.`);
  }
}

async function rollback(api, changes, transaction) {
  const failures = [];
  for (const change of [...changes].reverse()) {
    try {
      const candidate = await inspect(api, change.name, true);
      if (candidate && candidate.Id !== change.original.Id) {
        if (candidate.Config.Labels?.[marker] !== transaction) throw new Error('Nome ocupado.');
        await api('POST', `${containerRoute(candidate.Id)}/stop?t=20`);
        await api('DELETE', `${containerRoute(candidate.Id)}?force=true&v=false`);
      }
      const predecessor = await inspect(api, change.original.Id);
      if (predecessor.Name !== `/${change.name}`) {
        await api('POST', `${containerRoute(predecessor.Id)}/rename?name=${encodeURIComponent(change.name)}`);
      }
      await api('POST', `${containerRoute(predecessor.Id)}/start`);
      await healthy(api, predecessor.Id);
    } catch { failures.push(change.name); }
  }
  return failures;
}

/** Restringe somente as publicações da stack T02; não remove volumes nem predecessores. */
export async function bindLocalStack() {
  const client = dockerApi(localSocket());
  await client.connect();
  const api = client.request;
  const transaction = randomUUID();
  const snapshots = [];
  const changes = [];
  try {
    // Toda validação e leitura dos arquivos acontece antes da primeira parada.
    for (const definition of definitions) {
      const original = await inspect(api, expectedName(definition));
      assertScope(original, definition);
      if (!original.State.Running || original.State.Health?.Status !== 'healthy') {
        throw new Error('A stack T02 precisa estar saudável antes de restringir suas portas.');
      }
      const bindings = original.HostConfig.PortBindings[definition.port];
      const changeNeeded = bindings.length !== 1 || bindings[0].HostIp !== '127.0.0.1';
      snapshots.push({ definition, original, changeNeeded, archives: [] });
    }
    for (const snapshot of snapshots.filter(item => item.changeNeeded)) {
      for (const file of snapshot.definition.files) {
        const bytes = await api('GET', `${containerRoute(snapshot.original.Id)}/archive?path=${encodeURIComponent(file)}`,
          { archive: true });
        if (!bytes.length) throw new Error('Um arquivo interno necessário não pôde ser preservado.');
        snapshot.archives.push({ file, directory: path.posix.dirname(file), bytes,
          digest: archiveDigest(bytes, file) });
      }
    }
    for (const snapshot of snapshots.filter(item => item.changeNeeded)) {
      const { definition, original } = snapshot;
      const name = expectedName(definition);
      const predecessorName = `${name}_previous_${transaction}`;
      const change = { ...snapshot, name, predecessorName };
      changes.push(change);
      await api('POST', `${containerRoute(original.Id)}/stop?t=20`);
      await api('POST', `${containerRoute(original.Id)}/rename?name=${encodeURIComponent(predecessorName)}`);
      const hostConfig = structuredClone(original.HostConfig);
      hostConfig.PortBindings = {
        [definition.port]: [{ HostIp: '127.0.0.1', HostPort: definition.hostPort }],
      };
      const endpoint = original.NetworkSettings.Networks[network];
      const created = await api('POST', `/containers/create?name=${encodeURIComponent(name)}`, { body: {
        ...original.Config, Image: original.Image,
        Labels: { ...original.Config.Labels, [marker]: transaction }, HostConfig: hostConfig,
        NetworkingConfig: { EndpointsConfig: { [network]: {
          Aliases: endpoint.Aliases, ...(endpoint.DriverOpts ? { DriverOpts: endpoint.DriverOpts } : {}),
          ...(endpoint.IPAMConfig ? { IPAMConfig: endpoint.IPAMConfig } : {}),
        } } },
      } });
      if (typeof created?.Id !== 'string') throw new Error('O Docker não confirmou a criação local.');
      for (const archive of snapshot.archives) {
        await api('PUT', `${containerRoute(created.Id)}/archive?path=${encodeURIComponent(archive.directory)}&noOverwriteDirNonDir=1&copyUIDGID=1`,
          { body: archive.bytes });
        const copied = await api('GET', `${containerRoute(created.Id)}/archive?path=${encodeURIComponent(archive.file)}`,
          { archive: true });
        try {
          if (!archive.digest.equals(archiveDigest(copied, archive.file))) {
            throw new Error('A cópia de um arquivo interno não foi confirmada.');
          }
        } finally { copied.fill(0); }
      }
      await api('POST', `${containerRoute(created.Id)}/start`);
      assertReplacement(await healthy(api, created.Id), original, definition);
    }
    // Prova o conjunto completo antes de devolver os nomes de reversão.
    for (const snapshot of snapshots) {
      const current = await healthy(api, expectedName(snapshot.definition));
      assertReplacement(current, snapshot.original, snapshot.definition);
    }
    return { recreated: changes.map(change => change.name),
      predecessors: changes.map(change => change.predecessorName) };
  } catch (error) {
    const failures = await rollback(api, changes, transaction);
    if (failures.length) {
      throw new Error(`Falha no bind local; restauração pendente para ${failures.join(', ')}. ` +
        'Os predecessores foram preservados; não inicie outra stack sobre o volume.');
    }
    throw new Error(changes.length ? 'Falha no bind local; os contêineres originais foram restaurados.' :
      error instanceof Error ? error.message : 'Falha na preparação do bind local.');
  } finally {
    for (const snapshot of snapshots) for (const archive of snapshot.archives) archive.bytes.fill(0);
  }
}
