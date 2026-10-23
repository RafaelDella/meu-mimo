import path from 'node:path';

// Os entrypoints Next/worker são iniciados com cwd=web. import.meta.url é
// reescrito pelo bundler e não representa o caminho do fonte no build Next.
const webRoot = path.resolve(/* turbopackIgnore: true */ process.cwd());
const runtimeRoot = path.resolve(webRoot, '../.artifacts/t14-runtime');

/** Somente combinações locais nominais; não consulta serviços nem recebe URLs alternativas. */
export function localMediaTarget(environment: NodeJS.ProcessEnv = process.env) {
  const database = new URL(environment.DATABASE_URL ?? '');
  const match = /^\/meumimo_(t(?:0[6-9]|1[0-4]))(_dev)?$/.exec(database.pathname);
  if (!match || database.username !== 'meumimo_runtime' ||
      !['postgres:', 'postgresql:'].includes(database.protocol) || database.hash ||
      [...database.searchParams].length > 1 || [...database.searchParams].some(([key, value]) => key !== 'schema' || value !== 'app')) {
    throw new Error('Banco de mídia local inválido.');
  }
  const task = match[1];
  const restore = environment.PILOT_MODE === 'restore';
  const target = restore ? 'restore' : match[2] ? 'development' : 'integration';
  const directory = task === 't14' ? restore ? path.join(runtimeRoot, 'restore') : runtimeRoot :
    path.resolve(webRoot, `../.artifacts/${task}-runtime`);
  const prefix = task === 't06' ? target : `${task}-${target}`;
  const temp = path.join(directory, 'temp', ...(restore ? [] : [target]));
  const port = restore ? 4321 : 4311;
  if (!(task === 't14' ? database.hostname === '127.0.0.1' : ['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)) ||
      database.port !== (restore ? '55322' : '54322') || (restore && (task !== 't14' || match[2])) ||
      environment.SUPABASE_URL !== `http://127.0.0.1:${restore ? 55321 : 54321}` ||
      environment.APP_ORIGIN !== `http://127.0.0.1:${restore ? 4320 : match[2] ? 4301 : 4310}` ||
      environment.MEDIA_GATEWAY_URL !== `http://127.0.0.1:${port}` ||
      (environment.MEDIA_PREFIX !== undefined && environment.MEDIA_PREFIX !== prefix) ||
      (environment.MEDIA_TEMP_DIR !== undefined && environment.MEDIA_TEMP_DIR !== temp)) {
    throw new Error('Recursos de mídia local incompatíveis.');
  }
  if (task === 't14' ? environment.PILOT_MODE !== target ||
      environment.PILOT_PROJECT_ID !== (restore ? 'meumimo-t14-restore' : 'meumimo-t02') || environment.PILOT_DIRECTORY !== directory :
      ['PILOT_MODE', 'PILOT_PROJECT_ID', 'PILOT_DIRECTORY'].some(key => environment[key] !== undefined)) {
    throw new Error('Modo do piloto incompatível com a mídia local.');
  }
  return { port, prefix, temp };
}
