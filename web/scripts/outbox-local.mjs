import { spawn } from 'node:child_process';
import path from 'node:path';
import { assertLocalDatabase, readState, taskResources, webRoot } from './local-runtime.mjs';

const [task = 't05', target = 'development', mode] = process.argv.slice(2);
if (!['development', 'integration'].includes(target) || (mode && mode !== '--once') || process.argv.length > 5) {
  throw new Error('Use outbox-local.mjs t05 development|integration [--once].');
}
const resources = taskResources(task);
const state = readState(task);
const runtime = Object.fromEntries(Object.entries(state.runtime).filter(([key]) => !key.startsWith('MEDIA_')));
if (target === 'development') {
  const url = new URL(runtime.DATABASE_URL);
  url.pathname = `/${resources.development}`;
  runtime.DATABASE_URL = url.toString();
  runtime.APP_ORIGIN = 'http://127.0.0.1:4301';
}
assertLocalDatabase(runtime.DATABASE_URL, target === 'development' ? resources.development : resources.database);
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(T(?:0[2456789]|1[012])_|SUPABASE_|MEDIA_|FFMPEG_|FFPROBE_|MIGRATION_|SHADOW_)/i.test(key)));
Object.assign(environment, runtime);
const child = spawn(process.execPath, ['--conditions=react-server', path.join(webRoot, 'scripts/outbox-worker.mjs'),
  ...(mode ? [mode] : [])], { cwd: webRoot, env: environment, stdio: 'inherit', windowsHide: true });
const stop = () => child.kill();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
child.once('error', () => { process.stderr.write('Não foi possível iniciar o consumidor local.\n'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
