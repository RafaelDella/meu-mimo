import { spawn } from 'node:child_process';
import path from 'node:path';
import { webRoot } from './local-runtime.mjs';
import { mediaEnvironment } from './media-environment.mjs';

const args = process.argv.slice(2);
const task = ['t06', 't07', 't08', 't09', 't10', 't11', 't12', 't13'].includes(args[0]) ? args.shift() : 't06';
const [target = 'development', mode] = args;
if (args.length > 2 || (mode && !['--once', '--purge-once', '--manual'].includes(mode))) throw new Error('Use media-local.mjs [t06|t07|t08|t09|t10|t11|t12|t13] development|integration [--once|--purge-once|--manual].');
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(T(?:0[2456789]|1[0123])_|SUPABASE_|MEDIA_|FFMPEG_|FFPROBE_|MIGRATION_|SHADOW_)/i.test(key)));
Object.assign(environment, mediaEnvironment(target, task));
const child = spawn(process.execPath, ['--conditions=react-server', path.join(webRoot, 'scripts/media-worker.mjs'),
  ...(mode ? [mode] : [])], { cwd: webRoot, env: environment, stdio: 'inherit', windowsHide: true });
process.once('SIGINT', () => child.kill());
process.once('SIGTERM', () => child.kill());
child.once('error', () => { process.stderr.write('Não foi possível iniciar o processo de mídia.\n'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
