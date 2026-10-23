import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindLocalStack } from './bind-local-stack.mjs';
import { pilotResources } from './pilot/resources.mjs';
import { assertPilotDatabase, assertPilotRuntime } from './pilot/runtime-environment.mjs';

export const webRoot = fileURLToPath(new URL('../', import.meta.url));
export const artifactRoot = path.resolve(webRoot, '../.artifacts/t02-runtime');
export const statePath = path.join(artifactRoot, 'integration.json');
mkdirSync(artifactRoot, { recursive: true });

export function taskResources(task = 't02') {
  if (!['t02', 't04', 't05', 't06', 't07', 't08', 't09', 't10', 't11', 't12', 't13', 't14'].includes(task)) throw new Error('Use somente t02, t04, t05, t06, t07, t08, t09, t10, t11, t12, t13 ou t14.');
  const directory = path.resolve(webRoot, `../.artifacts/${task}-runtime`);
  return { task, directory, statePath: path.join(directory, 'integration.json'),
    database: task === 't02' ? 'postgres' : `meumimo_${task}`,
    development: `meumimo_${task}_dev`, shadow: `meumimo_${task}_shadow`,
    port: task === 't02' ? 4302 : 4310 };
}

export function dockerEnvironment() {
  const environment = { ...process.env };
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs/DockerDesktop/resources/bin'),
      'C:/Program Files/Docker/Docker/resources/bin',
    ];
    const directory = candidates.find(candidate => existsSync(path.join(candidate, 'docker.exe')));
    if (!directory) throw new Error('Docker Desktop não encontrado. O shim npm docker não é um engine.');
    const pathKey = Object.keys(environment).find(key => key.toLowerCase() === 'path') ?? 'PATH';
    environment[pathKey] = `${directory}${path.delimiter}${environment[pathKey] ?? ''}`;
  }
  return environment;
}

export function assertLocalDatabase(value, database) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.port !== '54322' || url.pathname !== `/${database}` ||
      [...url.searchParams].length > 1 ||
      [...url.searchParams].some(([key, value]) => key !== 'schema' || value !== 'app') || url.hash) {
    throw new Error('O comando aceita somente o banco local reservado de T02.');
  }
}

export function supabase(args) {
  return execFileSync(process.execPath, [path.join(webRoot, 'node_modules/supabase/dist/supabase.js'),
    ...args, '--agent', 'no'], {
    cwd: webRoot, env: dockerEnvironment(), encoding: 'utf8', windowsHide: true,
    maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function readState(task = 't02', target = 'integration') {
  if (!['development', 'integration', 'restore'].includes(target) || (target === 'restore' && task !== 't14')) {
    throw new Error('Restore é exclusivo do piloto T14.');
  }
  const resources = target === 'restore' ? { ...pilotResources(target), statePath: path.join(pilotResources(target).directory, 'integration.json') } : taskResources(task);
  if (!existsSync(resources.statePath)) throw new Error('Execute local:prepare para a tarefa depois de iniciar a stack local.');
  const state = JSON.parse(readFileSync(resources.statePath, 'utf8'));
  if (target === 'restore') {
    assertPilotRuntime(state.runtime, target);
    if (state.integration.T02_PROJECT_ID !== resources.project || state.integration.SUPABASE_URL !== state.runtime.SUPABASE_URL ||
        state.integration.T02_TEST_ORIGIN !== state.runtime.APP_ORIGIN || state.integration.T02_MAIL_URL !== `http://127.0.0.1:${resources.mailPort}` ||
        state.integration.T02_TASK !== 't14') throw new Error('Estado do restore fora da combinação nominal.');
    assertPilotDatabase(state.integration.T02_DATABASE_URL, target);
    assertPilotDatabase(state.integration.T02_AUTH_DATABASE_URL, target, 'auth');
    return state;
  }
  if (state.integration.T02_PROJECT_ID !== 'meumimo-t02' ||
      state.runtime.APP_ORIGIN !== `http://127.0.0.1:${resources.port}` ||
      state.runtime.SUPABASE_URL !== 'http://127.0.0.1:54321' ||
      state.integration.SUPABASE_URL !== state.runtime.SUPABASE_URL) throw new Error('Estado local inesperado.');
  assertLocalDatabase(state.integration.T02_DATABASE_URL, resources.database);
  assertLocalDatabase(state.migration.integration, resources.database);
  assertLocalDatabase(state.migration.development, resources.development);
  assertLocalDatabase(state.migration.shadow, resources.shadow);
  assertLocalDatabase(state.runtime.DATABASE_URL, resources.database);
  if (task !== 't02') assertLocalDatabase(state.integration.T02_AUTH_DATABASE_URL, 'postgres');
  if (task === 't14') {
    assertPilotRuntime(state.runtime, 'integration');
    assertPilotDatabase(state.integration.T02_DATABASE_URL, 'integration');
    assertPilotDatabase(state.integration.T02_AUTH_DATABASE_URL, 'integration', 'auth');
    if (state.integration.T02_TASK !== task || state.integration.T02_TEST_ORIGIN !== state.runtime.APP_ORIGIN ||
        state.integration.T02_MAIL_URL !== 'http://127.0.0.1:54324') throw new Error('Estado de integração T14 inesperado.');
  }
  return state;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'start') throw new Error('Use local-runtime.mjs start.');
  const environment = dockerEnvironment();
  const engine = execFileSync(process.platform === 'win32' ? 'docker.exe' : 'docker',
    ['version', '--format', '{{.Server.Os}}'], { env: environment, encoding: 'utf8', windowsHide: true });
  if (engine.trim() !== 'linux') throw new Error('É necessário um engine Docker Linux real.');
  try {
    const output = supabase(['start', '--exclude', 'imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
    writeFileSync(path.join(artifactRoot, 'supabase-start.log'), output);
  } catch (error) {
    writeFileSync(path.join(artifactRoot, 'supabase-start-error.log'), `${error.stdout ?? ''}\n${error.stderr ?? ''}`);
    throw new Error('Não foi possível iniciar a stack; confira o artefato local supabase-start-error.log.');
  }
  // O diagnóstico do helper não contém credenciais; preservar inclusive o aviso
  // de restauração pendente, em vez de escondê-lo no tratamento do CLI.
  const bindings = await bindLocalStack();
  writeFileSync(path.join(artifactRoot, 'bindings.json'), JSON.stringify(bindings, null, 2));
  process.stdout.write('Stack local meumimo-t02 saudável, com portas restritas a 127.0.0.1.\n');
}
