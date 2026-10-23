import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { readState } from '../../../scripts/local-runtime.mjs';
import { backupEngine, containerRoute } from '../../../scripts/pilot/backup-streams.mjs';
import { inspectSource, assertSourceWritersAbsent } from '../../../scripts/pilot/backup-source.mjs';
import { pilotRuntimeEnvironment } from '../../../scripts/pilot/runtime-environment.mjs';
import { probeDependencies } from '../../../scripts/pilot/health-probes.mjs';

// QA explícito com escritores encerrados: não é executado pelo runner de integração comum.
assert.equal(process.argv.length, 2); await assertSourceWritersAbsent();
const state = readState('t14'); const runtime = pilotRuntimeEnvironment(state, 'development');
const engine = await backupEngine(); const snapshots = await inspectSource(engine);
const baseline = await probeDependencies({ state, runtime, includeNext: false });
assert.deepEqual(baseline.codes, []);
for (const [service, component, code] of [['auth', 'auth', 'AUTH_UNAVAILABLE'], ['storage', 'storage', 'STORAGE_UNAVAILABLE'],
  ['db', 'postgres', 'DATABASE_UNAVAILABLE']]) {
  const container = snapshots.find(item => item.service === service).container;
  try {
    await engine.stop(container.Id);
    const stopped = await engine.request('GET', `${containerRoute(container.Id)}/json`);
    assert.equal(stopped.State.Running, false);
    const result = await probeDependencies({ state, runtime, includeNext: false });
    assert.ok(result.codes.includes(code)); assert.equal(result.components[component], 'unavailable');
  } finally {
    const current = await engine.request('GET', `${containerRoute(container.Id)}/json`);
    assert.equal(current.Id, container.Id); assert.equal(current.Name, container.Name); assert.equal(current.Image, container.Image);
    if (!current.State.Running) await engine.request('POST', `${containerRoute(container.Id)}/start`);
    const deadline = Date.now() + 90000;
    for (;;) {
      const observed = await engine.request('GET', `${containerRoute(container.Id)}/json`);
      if (observed.State.Running && (!observed.State.Health || observed.State.Health.Status === 'healthy')) break;
      assert.ok(Date.now() < deadline, 'Serviço próprio precisa ser recuperado antes de concluir.'); await delay(500);
    }
  }
  const recoveryDeadline = Date.now() + 90_000; let healthy = 0;
  while (Date.now() < recoveryDeadline && healthy < 2) {
    const recovered = await probeDependencies({ state, runtime, includeNext: false });
    healthy = recovered.codes.length === 0 ? healthy + 1 : 0;
    if (healthy < 2) await delay(500);
  }
  assert.equal(healthy, 2, 'Dependências devem voltar a duas leituras saudáveis após recuperar o serviço.');
  process.stdout.write(`${code}_AND_RECOVERY_VERIFIED\n`);
}
