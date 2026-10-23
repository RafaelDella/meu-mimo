import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { containerRoute } from './backup-streams.mjs';
import { sourceServices, webRoot } from './backup-source.mjs';
import { restoreName, restoreNetwork, restoredEnvironment, kongConfiguration } from './restore-secrets.mjs';

const marker = 'dev.meumimo.restore-owner';
const project = 'meumimo-t14-restore';
const bindings = { db: ['5432/tcp', '55322'], kong: ['8000/tcp', '55321'], inbucket: ['8025/tcp', '55324'] };
export function restoreLabels(owner) {
  return { 'com.supabase.cli.project': project, 'com.docker.compose.project': project,
    'com.supabase.cli.workdir': webRoot, [marker]: owner };
}

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error('Uma porta de recuperação está ocupada.')));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

export async function preflightRestore(engine) {
  for (const port of [55320, 55321, 55322, 55324, 4320, 4321]) await assertPortFree(port);
  for (const service of sourceServices) {
    if (await engine.request('GET', `/containers/${restoreName(service)}/json`, { missing: true })) throw new Error('Nome de recuperação já pertence a um contêiner.');
  }
  if (await engine.request('GET', `/networks/${restoreNetwork}`, { missing: true })) throw new Error('Rede de recuperação já existe.');
  for (const service of ['db', 'storage']) {
    if (await engine.request('GET', `/volumes/${restoreName(service)}`, { missing: true })) throw new Error('Volume de recuperação já existe.');
  }
}

export async function createRestoreResources(engine, owner) {
  const labels = restoreLabels(owner);
  // Dedicated bridge; host access uses explicit loopback publication. Egress is permitted.
  await engine.request('POST', '/networks/create', { body: { Name: restoreNetwork, Driver: 'bridge', Internal: false, CheckDuplicate: true, Labels: labels } });
  for (const service of ['db', 'storage']) {
    const name = restoreName(service);
    await engine.request('POST', '/volumes/create', { body: { Name: name, Driver: 'local', Labels: labels } });
    const volume = await engine.request('GET', `/volumes/${name}`);
    if (volume.Labels?.[marker] !== owner || volume.Driver !== 'local' || Object.keys(volume.Options ?? {}).length) throw new Error('Volume novo não foi confirmado.');
  }
}

export async function createRestoreContainer(engine, context, service, publish = false, maintenance = false) {
  const source = context.configuration.containers.find(item => item.service === service);
  if (!source || source.image !== context.manifest.imageDigests[service]) throw new Error('Imagem de recuperação divergente.');
  const config = source.config;
  const hostConfig = { NetworkMode: restoreNetwork, RestartPolicy: { Name: 'no' }, AutoRemove: false,
    ...(service === 'db' ? { ShmSize: 268435456 } : {}), PortBindings: {} };
  if (['db', 'storage'].includes(service)) hostConfig.Mounts = [{ Type: 'volume', Source: restoreName(service),
    Target: service === 'db' ? '/var/lib/postgresql/data' : '/mnt', ReadOnly: false }];
  if (publish && bindings[service]) {
    const [port, hostPort] = bindings[service];
    hostConfig.PortBindings = { [port]: [{ HostIp: '127.0.0.1', HostPort: hostPort }] };
  }
  const created = await engine.request('POST', `/containers/create?name=${restoreName(service)}`, { body: {
    Image: source.image, Entrypoint: maintenance ? ['node'] : config.Entrypoint,
    Cmd: maintenance ? ['-e', "process.on('SIGTERM',()=>process.exit(0));process.on('SIGINT',()=>process.exit(0));setInterval(()=>{},60000)"] : config.Cmd,
    Env: restoredEnvironment(service, config, context.secrets), WorkingDir: config.WorkingDir,
    User: maintenance ? 'root' : config.User, Healthcheck: maintenance ? { Test: ['NONE'] } : config.Healthcheck, StopSignal: config.StopSignal,
    ExposedPorts: config.ExposedPorts, Labels: restoreLabels(context.owner), HostConfig: hostConfig,
    NetworkingConfig: { EndpointsConfig: { [restoreNetwork]: { Aliases: [restoreName(service)] } } },
  } });
  containerRoute(created?.Id);
  context.containers[service] = created.Id;
  const observed = await engine.request('GET', `${containerRoute(created.Id)}/json`);
  if (observed.Config.Labels?.[marker] !== context.owner || observed.Image !== source.image) throw new Error('Contêiner novo não foi confirmado.');
  return created.Id;
}

export async function restoreComponent(engine, context, component) {
  const id = context.containers[component.service];
  if (!id) throw new Error('Destino de componente não existe.');
  const observed = await engine.request('GET', `${containerRoute(id)}/json`);
  if (observed.State.Running || observed.Config.Labels?.[marker] !== context.owner) throw new Error('Destino precisa estar parado e identificado.');
  await engine.putArchive(id, component.restorePath, createReadStream(context.plaintext.get(component.name)));
}

export async function startRestoreService(engine, context, service) {
  const id = context.containers[service];
  await engine.request('POST', `${containerRoute(id)}/start`);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const observed = await engine.request('GET', `${containerRoute(id)}/json`);
    if (observed.Config.Labels?.[marker] !== context.owner || !observed.State.Running
      || observed.State.Health?.Status === 'unhealthy') throw new Error('Serviço de recuperação sem saúde.');
    const check = observed.Config.Healthcheck?.Test;
    const configured = Array.isArray(check) && check.length > 0 && check[0] !== 'NONE';
    if (configured ? observed.State.Health?.Status === 'healthy' : !observed.State.Health || observed.State.Health.Status === 'healthy') return;
    await delay(500);
  }
  throw new Error('Tempo esgotado na saúde da recuperação.');
}

export async function closeRestore(engine, context) {
  const failures = [];
  for (const service of [...sourceServices].reverse()) {
    const id = context.containers[service]; if (!id) continue;
    try {
      const observed = await engine.request('GET', `${containerRoute(id)}/json`);
      if (observed.Config.Labels?.[marker] !== context.owner) throw new Error('Posse divergente.');
      if (observed.State.Running) await engine.stop(id);
    } catch { failures.push(service); }
  }
  if (failures.length) throw new Error('Há serviços próprios de recuperação com fechamento pendente.');
}

export async function installKongConfiguration(engine, context) {
  const content = Buffer.from(kongConfiguration(context.secrets));
  const header = Buffer.alloc(512); header.write('kong.yml'); header.write('0000644\0', 100);
  header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(`${content.length.toString(8).padStart(11, '0')}\0`, 124); header.write('00000000000\0', 136);
  header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257); header.write('00', 263);
  const sum = header.reduce((total, value) => total + value, 0); header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  const padding = Buffer.alloc((512 - content.length % 512) % 512 + 1024);
  try { await engine.putArchive(context.containers.kong, '/home/kong', Readable.from([header, content, padding])); }
  finally { content.fill(0); }
}
