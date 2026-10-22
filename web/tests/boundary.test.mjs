import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const webRoot = fileURLToPath(new URL('../', import.meta.url));
const artifactRoot = path.join(webRoot, '.artifacts');

test('o build rejeita um componente cliente que importa o módulo de servidor', { timeout: 120_000 }, async () => {
  const serverOnly = path.join(webRoot, 'src/server/only.ts');
  await assert.doesNotReject(access(serverOnly), 'A fundação precisa do módulo de servidor.');
  const { version } = JSON.parse(await readFile(path.join(webRoot, 'node_modules/next/package.json'), 'utf8'));
  await mkdir(artifactRoot, { recursive: true });
  const fixture = await mkdtemp(path.join(artifactRoot, 'boundary-'));

  try {
    await cp(path.join(webRoot, 'tests/fixtures/boundary'), fixture, { recursive: true });
    await mkdir(path.join(fixture, 'server'));
    await cp(serverOnly, path.join(fixture, 'server/only.ts'));
    await writeFile(path.join(fixture, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { next: version } }));
    let failure;
    try {
      await execute(process.execPath, [path.join(webRoot, 'node_modules/next/dist/bin/next'), 'build', fixture, '--webpack'], {
        cwd: webRoot,
        windowsHide: true,
        timeout: 90_000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, 'O build indevido não pode ser aprovado.');
    assert.equal(failure.code, 1, 'A falha deve vir do compilador, sem timeout ou comando ausente.');
    const diagnostic = `${failure.stdout}\n${failure.stderr}`;
    assert.match(diagnostic, /needs ["']server-only["']|depends on ["']server-only["']|cannot be imported from a Client Component/i);
    assert.match(diagnostic, /Server Components?|Client Component/i);
  } finally {
    const resolved = path.resolve(fixture);
    assert.ok(resolved.startsWith(`${path.resolve(artifactRoot)}${path.sep}`));
    await rm(resolved, { recursive: true, force: true });
  }
});
