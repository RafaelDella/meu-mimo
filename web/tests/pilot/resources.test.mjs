import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pilotResources, assertPilotTarget } from '../../scripts/pilot/resources.mjs';

function observed(resources) {
  const project = resources.project;
  const labels = { 'com.supabase.cli.project': project, 'com.docker.compose.project': project,
    'com.supabase.cli.workdir': path.resolve(import.meta.dirname, '../..') };
  const container = (service, destination) => ({ Name: `/supabase_${service}_${project}`,
    Image: `sha256:${'a'.repeat(64)}`, Config: { Labels: labels }, HostConfig: { NetworkMode: `supabase_network_${project}` },
    Mounts: [{ Type: 'volume', Name: `supabase_${service}_${project}`, Destination: destination }] });
  return { project, apiUrl: `http://127.0.0.1:${resources.apiPort}`,
    databaseUrl: `postgresql://runtime@127.0.0.1:${resources.dbPort}/${resources.database}?schema=app`,
    mediaUrl: `http://127.0.0.1:${resources.mediaPort}`, mediaPrefix: resources.mediaPrefix,
    directory: resources.directory, portsAvailable: true,
    containers: [container('db', '/var/lib/postgresql/data'), container('storage', '/mnt')] };
}

test('desenvolvimento e integração conservam bancos e namespaces distintos', () => {
  const dev = pilotResources('development'); const integration = pilotResources('integration');
  assert.equal(dev.database, 'meumimo_t14_dev'); assert.equal(integration.database, 'meumimo_t14');
  assert.equal(dev.mediaPrefix, 't14-development'); assert.equal(integration.mediaPrefix, 't14-integration');
  assert.equal(dev.nextPort, 4301); assert.equal(integration.nextPort, 4310);
  assert.ok(path.isAbsolute(dev.directory)); assert.equal(dev.project, 'meumimo-t02');
  assert.doesNotThrow(() => assertPilotTarget(dev, observed(dev)));
});

test('restore usa projeto, portas e diretório próprios, sem aceitar outro modo', () => {
  const value = pilotResources('restore');
  assert.equal(value.project, 'meumimo-t14-restore');
  assert.deepEqual([value.apiPort, value.dbPort, value.mailPort, value.nextPort, value.mediaPort], [55321, 55322, 55324, 4320, 4321]);
  assert.notEqual(value.directory, pilotResources('development').directory);
  assert.throws(() => pilotResources('production'));
  assert.doesNotThrow(() => assertPilotTarget(value, observed(value)));
});

test('recusa host remoto, banco trocado, prefixo genérico, porta ocupada e diretório externo', () => {
  const value = pilotResources('development');
  for (const change of [{ apiUrl: 'https://example.test' }, { mediaUrl: 'http://127.0.0.1:4321' },
    { databaseUrl: 'postgresql://runtime@127.0.0.1:54322/meumimo_t13_dev' },
    { mediaPrefix: 'development' }, { portsAvailable: false }, { directory: path.dirname(value.directory) }]) {
    assert.throws(() => assertPilotTarget(value, { ...observed(value), ...change }));
  }
});

test('recusa labels, rede, imagem ou mounts alheios inclusive no destino de restore', () => {
  for (const mode of ['development', 'restore']) {
    const value = pilotResources(mode);
    for (const change of [container => { container.Config.Labels['com.supabase.cli.project'] = 'outro'; },
      container => { container.HostConfig.NetworkMode = 'bridge'; },
      container => { container.Image = 'latest'; },
      container => { container.Mounts[0].Name = mode === 'restore' ? 'supabase_db_meumimo-t02' : 'volume-alheio'; },
      container => { container.Mounts[0].Type = 'bind'; }]) {
      const current = observed(value); change(current.containers[0]);
      assert.throws(() => assertPilotTarget(value, current));
    }
  }
});
