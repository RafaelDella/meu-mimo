import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsRoot = fileURLToPath(new URL('../tests/', import.meta.url));
const excluded = new Set(['e2e', 'fixtures']);

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name)) files.push(...await collect(filename));
    else if (entry.isFile() && /\.test\.(?:mjs|ts)$/.test(entry.name)) files.push(filename);
  }
  return files.sort();
}

const files = await collect(testsRoot);
if (!files.length) throw new Error('Nenhum teste nativo encontrado.');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
