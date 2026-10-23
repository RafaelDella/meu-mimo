import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { emitDiagnostic } from '../src/server/audit/diagnostics.ts';

test('diagnóstico serializa somente cinco campos permitidos sem tocar extras maliciosos', () => {
  const output = []; const original = console.info;
  console.info = value => output.push(value);
  try {
    emitDiagnostic({ route: 'ACTION_APPLY', result: 'UNAVAILABLE', status: 503, durationMs: 1.5,
      correlationId: randomUUID(), reason: 'Não registrar este motivo',
      error: { toJSON() { throw new Error('O serializador não deve alcançar este objeto.'); } } });
  } finally { console.info = original; }
  assert.equal(output.length, 1);
  const event = JSON.parse(output[0]);
  assert.deepEqual(Object.keys(event).sort(), ['correlationId', 'durationMs', 'result', 'route', 'status']);
  assert.equal(event.route, 'ACTION_APPLY'); assert.equal(event.result, 'UNAVAILABLE'); assert.equal(event.durationMs, 2);
  assert.equal(output[0].includes('motivo'), false);
});

test('diagnóstico descarta enum correlação status ou duração inválidos', () => {
  const output = []; const original = console.info; console.info = value => output.push(value);
  const valid = { route: 'OVERVIEW', result: 'OK', status: 200, durationMs: 1, correlationId: randomUUID() };
  try {
    for (const extra of [{ route: 'SQL privado' }, { result: 'Mensagem privada' }, { status: 999 },
      { durationMs: Number.NaN }, { durationMs: -1 }, { correlationId: 'Dados privados' }]) emitDiagnostic({ ...valid, ...extra });
  } finally { console.info = original; }
  assert.deepEqual(output, []);
});
