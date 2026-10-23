import assert from 'node:assert/strict';
import test from 'node:test';
import { privateDiagnostic } from '../../scripts/pilot/error-diagnostic.mjs';

test('diagnóstico remove segredo em mensagem multilinha, nome e valores de asserção', () => {
  const secret = 'segredo-fora-do-relatorio'; const error = new Error(`falha\n${secret}`);
  error.name = secret; error.actual = secret; error.expected = secret;
  error.stack += `\n    at operation (C:/workspace/web/scripts/pilot/restore.mjs:80:12)\n    at ${secret}`;
  const report = privateDiagnostic(error);
  assert.equal(report.name, 'Error'); assert.ok(!JSON.stringify(report).includes(secret));
  assert.deepEqual(report.frames.slice(-1), [{ file: 'scripts/pilot/restore.mjs', line: 80, column: 12 }]);
});
