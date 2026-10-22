import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { dockerApi, localSocket } from './bind-local-stack.mjs';
import { webRoot } from './local-runtime.mjs';

// Atualiza apenas o Auth da stack reservada; banco, portas e segredos permanecem.
export async function configureAuthCallbacks() {
  const client = dockerApi(localSocket());
  await client.connect();
  const api = client.request;
  const name = 'supabase_auth_meumimo-t02';
  const route = id => `/containers/${encodeURIComponent(id)}`;
  const original = await api('GET', `${route(name)}/json`);
  const labels = original.Config.Labels ?? {};
  const normalize = value => path.resolve(value).toLowerCase();
  if (labels['com.supabase.cli.project'] !== 'meumimo-t02' ||
      normalize(labels['com.supabase.cli.workdir'] ?? '') !== normalize(webRoot) ||
      original.Mounts.length || Object.keys(original.HostConfig.PortBindings ?? {}).length ||
      original.HostConfig.NetworkMode !== 'supabase_network_meumimo-t02' ||
      !original.State.Running) throw new Error('Auth local fora do escopo esperado.');
  const key = 'GOTRUE_URI_ALLOW_LIST=';
  const environment = original.Config.Env ?? [];
  const previous = environment.find(value => value.startsWith(key))?.slice(key.length) ?? '';
  const wanted = [4301, 4302, 4310].map(port => `http://127.0.0.1:${port}/api/auth/callback`);
  if (wanted.every(value => previous.split(',').includes(value))) return;
  const allowlist = [...new Set([...previous.split(',').filter(Boolean), ...wanted])].join(',');
  const transaction = randomUUID();
  const predecessor = `${name}_previous_${transaction}`;
  let replacement;
  let renamed = false;
  try {
    await api('POST', `${route(original.Id)}/stop?t=20`);
    await api('POST', `${route(original.Id)}/rename?name=${encodeURIComponent(predecessor)}`);
    renamed = true;
    const network = 'supabase_network_meumimo-t02';
    const created = await api('POST', `/containers/create?name=${name}`, { body: {
      ...original.Config, Image: original.Image,
      Env: [...environment.filter(value => !value.startsWith(key)), key + allowlist],
      Labels: { ...labels, 'dev.meumimo.auth-transaction': transaction },
      HostConfig: original.HostConfig,
      NetworkingConfig: { EndpointsConfig: { [network]: {
        Aliases: original.NetworkSettings.Networks[network].Aliases,
      } } },
    } });
    replacement = created.Id;
    await api('POST', `${route(replacement)}/start`);
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const current = await api('GET', `${route(replacement)}/json`);
      if (current.State.Health?.Status === 'healthy') return;
      if (!current.State.Running || current.State.Health?.Status === 'unhealthy') break;
      await delay(500);
    }
    throw new Error('Auth não recuperou saúde.');
  } catch {
    try {
      const candidate = await api('GET', `${route(name)}/json`, { missing: true });
      if (candidate && candidate.Id !== original.Id) {
        if (candidate.Config.Labels?.['dev.meumimo.auth-transaction'] !== transaction) throw new Error('Nome ocupado.');
        await api('POST', `${route(candidate.Id)}/stop?t=20`);
        await api('DELETE', `${route(candidate.Id)}?force=true&v=false`);
      }
      if (renamed) await api('POST', `${route(original.Id)}/rename?name=${name}`);
      await api('POST', `${route(original.Id)}/start`);
    } catch { throw new Error(`Auth requer restauração manual a partir de ${predecessor}; não inicie outra stack.`); }
    throw new Error('Não foi possível configurar o callback local; o Auth anterior foi restaurado.');
  }
}
