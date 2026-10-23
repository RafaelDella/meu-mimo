import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { custodyRoot, readPrivateJson, writePrivateJson, withMaintenanceLock } from './custody.mjs';
import { assertProcessIdentity, assertSnapshot } from './process-contract.mjs';
import { sameProcess } from './process-identity.mjs';

export const supervisorFiles = Object.freeze({ snapshot: path.join(custodyRoot, 'supervisor.json'),
  lock: path.join(custodyRoot, 'supervisor.lock'), stop: path.join(custodyRoot, 'supervisor-stop.json') });
const fail = code => { throw Object.assign(new Error(code), { code }); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sameIdentity = (left, right) => ['pid', 'creationTime', 'executable'].every(key => left[key] === right[key]);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
async function optional(file) {
  try { return await readPrivateJson(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function lockValue(value) {
  if (!exact(value, ['formatVersion', 'owner', 'manager', 'createdAt']) || value.formatVersion !== 1
    || !uuid(value.owner) || !iso(value.createdAt)) fail('LOCAL_OWNERSHIP_CONFLICT');
  assertProcessIdentity(value.manager); return value;
}
function stopValue(value) {
  if (!exact(value, ['formatVersion', 'owner', 'requestId', 'action', 'requestedAt']) || value.formatVersion !== 1
    || !uuid(value.owner) || !uuid(value.requestId) || value.action !== 'STOP' || !iso(value.requestedAt)) {
    fail('LOCAL_OWNERSHIP_CONFLICT');
  }
  return value;
}
export async function assertPortFree(port) {
  if (![4301, 4302, 4303, 4310, 4311].includes(port)) fail('LOCAL_PORT_INVALID');
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(Object.assign(new Error('LOCAL_PORT_IN_USE'), { code: 'LOCAL_PORT_IN_USE' })));
    server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()));
  });
}
export async function assertRuntimePortsFree() {
  for (const port of [4301, 4302, 4303, 4310, 4311]) await assertPortFree(port);
}
export async function readSupervisor() {
  const value = await optional(supervisorFiles.snapshot);
  if (value === null && await optional(supervisorFiles.lock) !== null) fail('LOCAL_OWNERSHIP_CONFLICT');
  return value === null ? null : assertSnapshot(value);
}
async function ownLock(snapshot) {
  const value = lockValue(await optional(supervisorFiles.lock));
  if (value.owner !== snapshot.owner || !sameIdentity(value.manager, snapshot.manager)) fail('LOCAL_OWNERSHIP_CONFLICT');
  return value;
}
async function endedChildren(snapshot) {
  for (const entry of Object.values(snapshot.children)) {
    if (await sameProcess(entry.identity)) fail('LOCAL_CHILD_STILL_RUNNING');
  }
}
async function retirePrevious() {
  const lock = await optional(supervisorFiles.lock); if (lock !== null) lockValue(lock);
  const snapshot = await readSupervisor();
  const stop = await optional(supervisorFiles.stop); if (stop !== null) stopValue(stop);
  if (!lock && !snapshot && !stop) return;
  if (!snapshot || (lock && (lock.owner !== snapshot.owner || !sameIdentity(lock.manager, snapshot.manager)))
    || (stop && stop.owner !== snapshot.owner)) fail('LOCAL_OWNERSHIP_CONFLICT');
  // A completed instance may share the caller process in a test; an active lock may never be adopted.
  if ((lock || snapshot.phase !== 'STOPPED') && await sameProcess(snapshot.manager)) fail('LOCAL_ALREADY_RUNNING');
  await endedChildren(snapshot); await assertRuntimePortsFree();
  if (!equal(snapshot, await readSupervisor()) || !equal(lock, await optional(supervisorFiles.lock))
    || !equal(stop, await optional(supervisorFiles.stop))) fail('LOCAL_OWNERSHIP_CONFLICT');
  await writePrivateJson(path.join(custodyRoot, 'reports', `supervisor-history-${randomUUID()}.json`),
    { formatVersion: 1, archivedAt: new Date().toISOString(), snapshot, lock, stop }, { exclusive: true });
  for (const [file, value] of [[supervisorFiles.stop, stop], [supervisorFiles.snapshot, snapshot], [supervisorFiles.lock, lock]]) {
    if (value !== null) await unlink(file);
  }
}
/** A short existing operational lock serializes ownership transitions, never gate execution. */
export async function claimSupervisor(manager) {
  assertProcessIdentity(manager);
  if (manager.pid !== process.pid || !await sameProcess(manager)) fail('PROCESS_IDENTITY_MISMATCH');
  return withMaintenanceLock(async () => {
    await retirePrevious(); await assertRuntimePortsFree();
    for (const name of ['processes.json', 'local-handle.json']) {
      const previous = await optional(path.join(custodyRoot, name));
      if (previous !== null && previous.status !== 'stopped') fail('LOCAL_OWNERSHIP_CONFLICT');
    }
    const owner = randomUUID(); const createdAt = new Date().toISOString();
    await writePrivateJson(supervisorFiles.lock, { formatVersion: 1, owner, manager, createdAt }, { exclusive: true });
    const snapshot = { formatVersion: 1, task: 't14', mode: 'development', owner, manager, phase: 'STARTING',
      status: 'starting', updatedAt: createdAt, children: {}, maintenance: null };
    await writePrivateJson(supervisorFiles.snapshot, assertSnapshot(snapshot), { exclusive: true });
    return snapshot;
  });
}
export async function publishSupervisor(snapshot) {
  assertSnapshot(snapshot); await ownLock(snapshot);
  const previous = await readSupervisor();
  if (!previous || previous.owner !== snapshot.owner || !sameIdentity(previous.manager, snapshot.manager)) {
    fail('LOCAL_OWNERSHIP_CONFLICT');
  }
  await writePrivateJson(supervisorFiles.snapshot, snapshot);
}
export async function releaseSupervisor(snapshot) {
  assertSnapshot(snapshot);
  if (!['STOPPED', 'FAILED'].includes(snapshot.phase)
    || Object.values(snapshot.children).some(entry => entry.state !== 'stopped')) fail('LOCAL_CHILD_STILL_RUNNING');
  return withMaintenanceLock(async () => {
    await ownLock(snapshot); await endedChildren(snapshot);
    await publishSupervisor(snapshot);
    const request = await optional(supervisorFiles.stop);
    if (request !== null) {
      stopValue(request); if (request.owner !== snapshot.owner) fail('LOCAL_OWNERSHIP_CONFLICT');
      await unlink(supervisorFiles.stop);
    }
    await unlink(supervisorFiles.lock);
  });
}
export async function hasStopRequest(owner) {
  const request = await optional(supervisorFiles.stop);
  if (request === null) return false;
  stopValue(request); if (request.owner !== owner) fail('LOCAL_OWNERSHIP_CONFLICT');
  return true;
}
export async function postStopRequest(snapshot) {
  assertSnapshot(snapshot); await ownLock(snapshot);
  if (!await sameProcess(snapshot.manager)) fail('PROCESS_IDENTITY_MISMATCH');
  const request = { formatVersion: 1, owner: snapshot.owner, requestId: randomUUID(), action: 'STOP', requestedAt: new Date().toISOString() };
  const previous = await optional(supervisorFiles.stop);
  if (previous !== null) {
    stopValue(previous); if (previous.owner !== snapshot.owner) fail('LOCAL_OWNERSHIP_CONFLICT');
    return;
  }
  try { await writePrivateJson(supervisorFiles.stop, request, { exclusive: true }); }
  catch (caught) {
    const current = await optional(supervisorFiles.stop);
    if (!current || !stopValue(current) || current.owner !== snapshot.owner) throw caught;
  }
}
