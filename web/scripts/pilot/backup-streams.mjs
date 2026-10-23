import http from 'node:http';
import { pipeline } from 'node:stream/promises';
import { localSocket, dockerApi } from '../bind-local-stack.mjs';

export const containerRoute = id => {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Identidade Docker inválida.');
  return `/containers/${id}`;
};

export async function backupEngine() {
  const socketPath = localSocket();
  const client = dockerApi(socketPath);
  const version = await client.request('GET', '/version');
  if (version?.Os !== 'linux' || Number(version.ApiVersion?.split('.')[1]) < 56) {
    throw new Error('A recuperação exige a API Docker Linux 1.56.');
  }
  await client.connect();
  function response(method, route, { source, body, timeout = 1_800_000 } = {}) {
    return new Promise((resolve, reject) => {
      let uploadCompletion;
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      const fail = () => reject(new Error('Falha no transporte Docker local.'));
      const request = http.request({ socketPath, method, path: `/v1.56${route}`,
        signal: AbortSignal.timeout(timeout), headers: source ? { 'Content-Type': 'application/x-tar' } :
          payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {},
      }, result => {
        result.on('error', fail);
        if (result.statusCode < 200 || result.statusCode >= 300) {
          result.resume(); fail(); return;
        }
        result.uploadCompletion = uploadCompletion;
        resolve(result);
      });
      request.on('error', fail);
      if (source) { uploadCompletion = pipeline(source, request); uploadCompletion.catch(fail); }
      else request.end(payload);
    });
  }
  return {
    request: client.request, version,
    async getArchive(id, filename) {
      return response('GET', `${containerRoute(id)}/archive?path=${encodeURIComponent(filename)}`);
    },
    async putArchive(id, directory, source) {
      const result = await response('PUT', `${containerRoute(id)}/archive?path=${encodeURIComponent(directory)}&copyUIDGID=1&noOverwriteDirNonDir=1`, { source });
      for await (const unused of result) void unused;
      await result.uploadCompletion;
    },
    async stop(id) {
      const result = await response('POST', `${containerRoute(id)}/stop?t=-1`, { timeout: 180_000 });
      for await (const unused of result) void unused;
    },
    async exec(id, command) {
      if (!Array.isArray(command) || command.some(value => typeof value !== 'string')) throw new Error('Comando interno inválido.');
      const created = await client.request('POST', `${containerRoute(id)}/exec`, { body: {
        AttachStdout: true, AttachStderr: true, Tty: false, User: 'root', Cmd: command,
      } });
      if (!/^[a-f0-9]{64}$/.test(created?.Id ?? '')) throw new Error('Execução interna não confirmada.');
      const output = await response('POST', `/exec/${created.Id}/start`, { body: { Detach: false, Tty: false } });
      const chunks = []; let length = 0;
      for await (const chunk of output) {
        length += chunk.length;
        if (length > 1024 * 1024) { output.destroy(); throw new Error('Saída interna excedeu o limite.'); }
        chunks.push(chunk);
      }
      const state = await client.request('GET', `/exec/${created.Id}/json`);
      if (state.ExitCode !== 0 || state.Running) throw new Error('Verificação interna recusada.');
      const bytes = Buffer.concat(chunks); const stdout = [];
      for (let position = 0; position < bytes.length;) {
        if (position + 8 > bytes.length || ![1, 2].includes(bytes[position])) throw new Error('Resposta interna inválida.');
        const size = bytes.readUInt32BE(position + 4);
        if (position + 8 + size > bytes.length) throw new Error('Resposta interna incompleta.');
        if (bytes[position] === 1) stdout.push(bytes.subarray(position + 8, position + 8 + size));
        position += 8 + size;
      }
      return Buffer.concat(stdout).toString('utf8');
    },
  };
}
