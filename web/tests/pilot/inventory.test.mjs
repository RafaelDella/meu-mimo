import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { assertPilotSourceInventory } from '../../scripts/pilot/inventory.mjs';

function inventory() {
  return ['db', 'inbucket', 'auth', 'rest', 'realtime', 'storage', 'kong'].map((service, index) => {
    const name = `supabase_${service}_meumimo-t02`; const network = 'supabase_network_meumimo-t02';
    const destination = { db: '/var/lib/postgresql/data', storage: '/mnt' }[service];
    const binding = { db: ['5432/tcp', '54322'], inbucket: ['8025/tcp', '54324'], kong: ['8000/tcp', '54321'] }[service];
    const ports = binding ? { [binding[0]]: [{ HostIp: '127.0.0.1', HostPort: binding[1] }] } : {};
    return { Id: String(index + 1).repeat(64), Name: `/${name}`, Image: `sha256:${'a'.repeat(64)}`,
      Config: { Labels: { 'com.supabase.cli.project': 'meumimo-t02', 'com.docker.compose.project': 'meumimo-t02',
        'com.supabase.cli.workdir': path.resolve(import.meta.dirname, '../..') } },
      State: { Running: true, Status: 'running', ...(service === 'rest' ? {} : { Health: { Status: 'healthy' } }) },
      HostConfig: { NetworkMode: network, PortBindings: structuredClone(ports),
        Binds: destination ? [`${name}:${destination}:rw`] : [] },
      NetworkSettings: { Networks: { [network]: { NetworkID: 'b'.repeat(64) } }, Ports: structuredClone(ports) },
      Mounts: destination ? [{ Type: 'volume', Name: name, Driver: 'local', Destination: destination,
        Source: `/var/lib/docker/volumes/${name}/_data`, RW: true }] : [] };
  });
}

test('inventário permite novos IDs somente com as mesmas imagens e recursos', () => {
  const previous = { containers: inventory() }; const current = inventory();
  current[0].Id = 'c'.repeat(64);
  assert.doesNotThrow(() => assertPilotSourceInventory(current, previous));
  current[0].Image = `sha256:${'d'.repeat(64)}`;
  assert.throws(() => assertPilotSourceInventory(current, previous));
});

test('origem recusa exposição, mount externo ou serviço sem saúde antes de publicar', () => {
  for (const mutate of [
    rows => { rows[0].Mounts[0].Source = '/volume/alheio'; },
    rows => { rows[0].HostConfig.Binds = ['/host/private:/var/lib/postgresql/data']; },
    rows => { rows[6].HostConfig.PortBindings['8000/tcp'][0].HostIp = '0.0.0.0'; },
    rows => { rows[2].State.Health.Status = 'unhealthy'; },
    rows => { rows[0].Config.Labels['com.supabase.cli.project'] = 'outro'; },
  ]) {
    const previous = { containers: inventory() }; const rows = inventory(); mutate(rows);
    assert.throws(() => assertPilotSourceInventory(rows, previous));
  }
});

test('inventário incompleto, duplicado ou em redes diferentes é recusado', () => {
  const rows = inventory(); assert.throws(() => assertPilotSourceInventory(rows.slice(1)));
  assert.throws(() => assertPilotSourceInventory([...rows.slice(0, 6), rows[0]]));
  rows[2].NetworkSettings.Networks.supabase_network_meumimo_t02 = { NetworkID: 'f'.repeat(64) };
  assert.throws(() => assertPilotSourceInventory(rows));
});
