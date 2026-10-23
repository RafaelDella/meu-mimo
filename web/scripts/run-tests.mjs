import { readdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsRoot = fileURLToPath(new URL('../tests/', import.meta.url));
const mode = process.argv[2] ?? 'unit';
if (!['unit', 'integration'].includes(mode) || process.argv.length > 3) {
  throw new Error('Modo de testes inválido: use unit ou integration.');
}
const excluded = new Set(['e2e', 'pilot-browser', 'fixtures', 'integration']);
if (mode === 'integration' && !['t04', 't05', 't06', 't07', 't08', 't09', 't10', 't11', 't12', 't13', 't14'].includes(process.env.T02_TASK)) excluded.add('stores');
if (mode === 'integration' && !['t05', 't06', 't07', 't08', 't09', 't10', 't11', 't12', 't13', 't14'].includes(process.env.T02_TASK)) { excluded.add('conversations'); excluded.add('notifications'); }
if (mode === 'integration' && !['t06', 't07', 't08', 't09', 't10', 't11', 't12', 't13', 't14'].includes(process.env.T02_TASK)) excluded.add('media');
if (mode === 'integration' && !['t07', 't08', 't09', 't10', 't11', 't12', 't13', 't14'].includes(process.env.T02_TASK)) excluded.add('activities');
if (mode === 'integration' && !['t08', 't09', 't10', 't11', 't12', 't13', 't14'].includes(process.env.T02_TASK)) excluded.add('points');
if (mode === 'integration' && !['t09', 't10', 't11', 't12', 't13', 't14'].includes(process.env.T02_TASK)) excluded.add('redemptions');
if (mode === 'integration' && !['t10', 't11', 't12', 't13', 't14'].includes(process.env.T02_TASK)) excluded.add('tickets');
if (mode === 'integration' && !['t11', 't12', 't13', 't14'].includes(process.env.T02_TASK)) excluded.add('albums');
if (mode === 'integration' && !['t12', 't13', 't14'].includes(process.env.T02_TASK)) excluded.add('relationship');
if (mode === 'integration' && !['t13', 't14'].includes(process.env.T02_TASK)) excluded.add('admin');
if (mode === 'integration' && process.env.T02_TASK !== 't14') excluded.add('pilot');
const root = mode === 'integration' ? path.join(testsRoot, 'integration') : testsRoot;
if (mode === 'integration') {
  try { await access(root); } catch { throw new Error('Nenhuma suíte de integração implementada.'); }
}

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name)) files.push(...await collect(filename));
    else if (entry.isFile() && /\.test\.(?:mjs|ts)$/.test(entry.name)) files.push(filename);
  }
  return files.sort();
}

const files = await collect(root);
if (!files.length) throw new Error(`Nenhum teste encontrado no modo ${mode}.`);
const result = spawnSync(process.execPath, [...(mode === 'integration' ? ['--conditions=react-server'] : []), '--test', '--test-concurrency=1', ...files], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
