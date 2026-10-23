import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePrivateJson } from './custody.mjs';
import { reportPath, disconnectRuntime } from './recovery-fixture-context.mjs';
export { fixturePath, reportPath } from './recovery-fixture-context.mjs';

const phases = ['prepare', 'source-after', 'erase', 'verify-restore', 'verify-web', 'cleanup'];

function diagnostic(error, depth = 0) {
  const names = ['Error', 'AssertionError', 'TypeError', 'RangeError', 'SyntaxError', 'AggregateError'];
  const operators = ['==', '===', '!=', '!==', 'strictEqual', 'notStrictEqual', 'deepStrictEqual', 'notDeepStrictEqual', 'match', 'doesNotMatch', 'fail'];
  const frames = [];
  // Keep repository locations only; never serialize the exception message, actual or expected.
  for (const line of String(error?.stack ?? '').split(/\r?\n/).filter(line => /^\s+at /.test(line))) {
    const found = /[\\/]web[\\/]((?:scripts|tests|src)[\\/][a-zA-Z0-9_.\\/-]+):(\d+):(\d+)/.exec(line);
    if (found && frames.length < 12) frames.push({ file: found[1].replaceAll('\\', '/'), line: Number(found[2]), column: Number(found[3]) });
  }
  return { name: names.includes(error?.name) ? error.name : 'Error',
    ...(typeof error?.code === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(error.code) ? { code: error.code } : {}),
    ...(operators.includes(error?.operator) ? { operator: error.operator } : {}), frames,
    ...(depth < 2 && error instanceof AggregateError ? { causes: error.errors.slice(0, 3).map(value => diagnostic(value, depth + 1)) } : {}) };
}

/** Internal synthetic proof only. No URL, UUID, credential or alternate path arguments. */
export async function recoveryFixtures(phase) {
  if (!phases.includes(phase)) throw new Error('Fase de recuperação inválida.');
  const startedAt = new Date().toISOString();
  try {
    let operation;
    if (phase === 'verify-restore') operation = (await import('./recovery-fixture-verify.mjs')).verifyRestore;
    else if (phase === 'verify-web') operation = (await import('./recovery-fixture-web.mjs')).verifyWeb;
    else {
      const source = await import('./recovery-fixture-source.mjs');
      operation = { prepare: source.prepareFixture, 'source-after': source.sourceAfter, erase: source.eraseFixture, cleanup: source.cleanupFixture }[phase];
    }
    const outcome = await operation(); const completedAt = new Date().toISOString();
    const report = { formatVersion: 1, phase, code: outcome.code, counts: outcome.counts, startedAt, completedAt,
      elapsedMs: Date.parse(completedAt) - Date.parse(startedAt), ...(outcome.webVerified === true ? { webVerified: true } : {}) };
    await writePrivateJson(reportPath, report); return report;
  } catch (error) {
    const completedAt = new Date().toISOString();
    await writePrivateJson(reportPath, { formatVersion: 1, phase, code: 'RECOVERY_FIXTURE_PHASE_FAILED', counts: {},
      startedAt, completedAt, elapsedMs: Date.parse(completedAt) - Date.parse(startedAt), diagnostic: diagnostic(error) });
    throw new Error('A fase da prova de recuperação foi recusada; consulte a evidência operacional privada.');
  } finally { await disconnectRuntime(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Use recovery-fixtures.mjs FASE.');
    const report = await recoveryFixtures(process.argv[2]);
    process.stdout.write(`${JSON.stringify({ code: report.code, counts: report.counts })}\n`);
  } catch { process.stderr.write('RECOVERY_FIXTURE_PHASE_FAILED\n'); process.exitCode = 1; }
}
