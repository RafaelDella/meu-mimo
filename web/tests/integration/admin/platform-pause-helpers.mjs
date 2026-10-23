import { createHmac, randomUUID } from 'node:crypto';
import { fileInput, fixtureBytes, processBatch } from '../media/helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';

export const storeTarget = f => ({ type: 'STORE', id: f.store.id });
export const pause = f => f.action(storeTarget(f), 'PAUSE_STORE');
export const resume = f => f.action(storeTarget(f), 'RESUME_STORE');
export async function merchantState(f, action) {
  const response = await f.owner.client.post(`${f.base()}/estado`, { action });
  expectStatus(response, 200); return response.json();
}

export async function invitation(f) {
  const request = { operationId: randomUUID() };
  const response = await f.owner.client.post(`${f.base()}/convites`, request); expectStatus(response, 201);
  const created = await response.json();
  return { ...created, request, token: new URL(created.url).pathname.split('/').at(-1) };
}

export async function photoReservation(f, person, collectionId) {
  const bytes = await fixtureBytes('photo.png'); const input = fileInput(bytes);
  const response = await person.client.post(`${f.base()}/midia/${collectionId}`, { files: [input] });
  expectStatus(response, 201); const [asset] = (await response.json()).items;
  f.trackRateKey(createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET)
    .update(`meumimo:t06:parts:${person.id}:${asset.id}`).digest('hex'));
  return { asset, input, bytes, path: `${f.base()}/midia/arquivos/${asset.id}` };
}

export const part = (person, photo, offset = 0, bytes = photo.bytes.subarray(offset)) =>
  person.client.request(`${photo.path}/partes?offset=${offset}`, { method: 'PUT', body: bytes,
    headers: { 'Content-Type': 'application/octet-stream' } });

export async function uploadPhoto(f, person, collectionId) {
  const photo = await photoReservation(f, person, collectionId);
  expectStatus(await part(person, photo), 200);
  expectStatus(await person.client.post(`${photo.path}/concluir`, {}), 202);
  const result = await processBatch();
  if (result.processed !== 1 || result.failed !== 0) throw new Error('A foto sintética exige processamento real concluído.');
  return photo;
}

export async function transition(f, ticket, action, extra = {}) {
  const person = action === 'REQUEST_CANCELLATION' ? f.ana : f.owner;
  const current = await f.ticket(ticket, f.owner);
  const request = { operationId: randomUUID(), expectedVersion: current.version, action,
    ...(action === 'FULFILL' ? {} : { text: 'Tratamento de obrigação existente.' }),
    ...(action === 'AGREE' ? { agreementDate: null } : {}),
    ...(action === 'CANCEL' ? { expectedBalance: current.cancellationImpact.balanceBefore, restock: false } : {}),
    ...(extra.restock ? { expectedStockRevision: current.cancellationImpact.restock.stockRevision } : {}), ...extra };
  const response = await person.client.post(`${f.ticketPath(ticket)}/transicoes`, request);
  expectStatus(response, 200); return { ...(await response.json()), request };
}
