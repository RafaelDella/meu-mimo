import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { readState, taskResources, webRoot } from './local-runtime.mjs';
import { prepareMediaTools } from './media-tools.mjs';

const task = process.argv[2] ?? 't06';
if (!['t06', 't07', 't08', 't09', 't10'].includes(task)) throw new Error('Use t06, t07, t08, t09 ou t10 para preparar mídia.');
execFileSync(process.execPath, ['scripts/prepare-local.mjs', task], { cwd: webRoot, windowsHide: true, stdio: 'inherit' });
const resources = taskResources(task);
const state = readState(task);
const tools = await prepareMediaTools();
const client = createClient(state.runtime.SUPABASE_URL, state.integration.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const bucket = 'meumimo-t06-private';
const found = await client.storage.getBucket(bucket);
if (found.error) {
  if (String(found.error.status) !== '404' && found.error.message !== 'Bucket not found') throw new Error('Não foi possível conferir o bucket reservado.');
  const created = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: 104_857_600,
    allowedMimeTypes: ['application/octet-stream', 'image/jpeg', 'video/mp4'] });
  if (created.error) throw new Error('Não foi possível criar o bucket privado reservado.');
} else if (found.data.public) throw new Error('O bucket reservado está público; não será usado.');
const authDatabase = new pg.Client({ connectionString: state.integration.T02_AUTH_DATABASE_URL });
await authDatabase.connect();
try { await authDatabase.query(readFileSync(path.join(webRoot, 'supabase/media-policies.sql'), 'utf8')); }
finally { await authDatabase.end(); }
state.media = { bucket, ffmpeg: tools.ffmpeg, ffprobe: tools.ffprobe };
for (const target of ['integration', 'development']) mkdirSync(path.join(resources.directory, 'temp', target), { recursive: true });
writeFileSync(resources.statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
process.stdout.write(`Mídia ${task.toUpperCase()} preparada: bucket privado, ferramentas locais e segredos separados do Next.\n`);
