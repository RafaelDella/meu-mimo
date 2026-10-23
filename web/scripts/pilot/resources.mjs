import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../../', import.meta.url));
const runtimeRoot = path.resolve(webRoot, '../.artifacts/t14-runtime');
const fields = ['project', 'apiPort', 'dbPort', 'mailPort', 'nextPort', 'mediaPort', 'database', 'mediaPrefix', 'directory'];
const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);

export function pilotResources(mode) {
  if (!['development', 'integration', 'restore'].includes(mode)) throw new Error('Use development, integration ou restore para o piloto local.');
  const restore = mode === 'restore';
  return Object.freeze({
    project: restore ? 'meumimo-t14-restore' : 'meumimo-t02',
    apiPort: restore ? 55321 : 54321, dbPort: restore ? 55322 : 54322,
    mailPort: restore ? 55324 : 54324, nextPort: restore ? 4320 : mode === 'development' ? 4301 : 4310,
    mediaPort: restore ? 4321 : 4311, database: mode === 'development' ? 'meumimo_t14_dev' : 'meumimo_t14',
    mediaPrefix: `t14-${mode}`, directory: restore ? path.join(runtimeRoot, 'restore') : runtimeRoot,
  });
}

function nominal(resources) {
  const found = ['development', 'integration', 'restore'].map(pilotResources)
    .find(expected => fields.every(field => resources?.[field] === expected[field]));
  if (!found) throw new Error('Recursos do piloto fora da combinação nominal.');
  return found;
}

function databaseMatches(value, resources) {
  try {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname === '127.0.0.1' &&
      url.port === String(resources.dbPort) && url.pathname === `/${resources.database}` && !url.hash &&
      [...url.searchParams].length <= 1 &&
      [...url.searchParams].every(([key, value]) => key === 'schema' && value === 'app');
  } catch { return false; }
}

/** Valida observações já coletadas; este módulo não inicia nem altera recursos. */
export function assertPilotTarget(resources, observed) {
  const expected = nominal(resources);
  if (observed?.project !== expected.project || observed.apiUrl !== `http://127.0.0.1:${expected.apiPort}` ||
      observed.mediaUrl !== `http://127.0.0.1:${expected.mediaPort}` || !databaseMatches(observed.databaseUrl, expected) ||
      observed.mediaPrefix !== expected.mediaPrefix || observed.portsAvailable !== true ||
      typeof observed.directory !== 'string' || !path.isAbsolute(observed.directory) ||
      normalize(observed.directory) !== normalize(expected.directory) ||
      !Array.isArray(observed.containers) || observed.containers.length !== 2) {
    throw new Error('Destino do piloto não corresponde aos recursos locais reservados.');
  }
  for (const [service, destination] of [['db', '/var/lib/postgresql/data'], ['storage', '/mnt']]) {
    const name = `supabase_${service}_${expected.project}`;
    const matches = observed.containers.filter(container => container?.Name === `/${name}`);
    const container = matches[0];
    const labels = container?.Config?.Labels ?? {};
    const mounts = container?.Mounts;
    const image = container?.ImageID ?? container?.Image;
    if (matches.length !== 1 || labels['com.supabase.cli.project'] !== expected.project ||
        labels['com.docker.compose.project'] !== expected.project ||
        typeof labels['com.supabase.cli.workdir'] !== 'string' || !path.isAbsolute(labels['com.supabase.cli.workdir']) ||
        normalize(labels['com.supabase.cli.workdir']) !== normalize(webRoot) ||
        container?.HostConfig?.NetworkMode !== `supabase_network_${expected.project}` ||
        !/^sha256:[a-f0-9]{64}$/.test(image ?? '') ||
        (container.ImageID && container.Image && container.ImageID !== container.Image) ||
        !Array.isArray(mounts) || mounts.length !== 1 || mounts[0].Type !== 'volume' ||
        mounts[0].Name !== name || mounts[0].Destination !== destination) {
      throw new Error('Projeto, imagem, rede ou volume do piloto não conferem; nenhum recurso foi alterado.');
    }
  }
}
