import { HEARTBEAT_MS, ROLES, assertParentMessage, assertWorkerMessage } from './process-contract.mjs';

const invalid = () => Object.assign(new Error('PROCESS_CONTRACT_INVALID'), { code: 'PROCESS_CONTRACT_INVALID' });
const placeholderOwner = '00000000-0000-0000-0000-000000000000';

export function openWorkerChannel(role) {
  if (!ROLES.includes(role)) throw invalid();
  const managed = typeof process.send === 'function';
  const controller = new AbortController();
  let owner; let phase = 'starting'; let lastRound = null; let sequence = 0;
  let heartbeatTimer; let bootTimer; let finishPromise; let finished = false;
  let initializedDone = !managed; let resolveBoot; let rejectBoot;
  const initialized = managed ? new Promise((resolve, reject) => { resolveBoot = resolve; rejectBoot = reject; }) : Promise.resolve();

  function settleBoot(error) {
    if (initializedDone) return;
    initializedDone = true; clearTimeout(bootTimer);
    if (error) rejectBoot(error); else resolveBoot();
  }
  function message(type, value = phase, round = lastRound) {
    return assertWorkerMessage({ formatVersion: 1, type, owner: owner ?? placeholderOwner, role,
      pid: process.pid, sequence: sequence + 1, phase: value, lastRound: round });
  }
  function send(type) {
    if (!managed || !owner || !process.connected) return Promise.resolve();
    const value = message(type); sequence = value.sequence;
    return new Promise(resolve => {
      try { process.send(value, error => { if (error) requestStop(); resolve(); }); }
      catch { requestStop(); resolve(); }
    });
  }
  function requestStop() {
    if (finished || controller.signal.aborted) return;
    phase = 'draining'; controller.abort(); settleBoot();
    void send('HEARTBEAT');
  }
  function fail(error) {
    if (finished) return;
    phase = 'failed'; process.exitCode = 1; controller.abort(); settleBoot(error);
    void send('HEARTBEAT');
  }
  function receive(raw) {
    if (finished) return;
    let value;
    try { value = assertParentMessage(raw); }
    catch (error) { fail(error); return; }
    if (value.type === 'BOOT') {
      if (owner || value.role !== role) { fail(invalid()); return; }
      owner = value.owner;
      heartbeatTimer = setInterval(() => { void send('HEARTBEAT'); }, HEARTBEAT_MS);
      heartbeatTimer.unref();
      void send('HEARTBEAT'); settleBoot();
    } else if (!owner) fail(invalid());
    else if (value.owner === owner) requestStop();
  }
  function setPhase(value) {
    if (finished || value === 'stopped') throw invalid();
    message('HEARTBEAT', value);
    phase = controller.signal.aborted && value !== 'failed' ? 'draining' : value;
    if (managed && owner && phase !== 'starting' && sequence === 1) void send('HEARTBEAT');
  }
  function round(result) {
    if (finished || !result || typeof result !== 'object' || Array.isArray(result) ||
        Object.keys(result).length !== 3 || !['code', 'durationMs', 'counts'].every(key => Object.hasOwn(result, key))) throw invalid();
    const value = { code: result.code, completedAt: new Date().toISOString(), durationMs: result.durationMs, counts: result.counts };
    message('HEARTBEAT', phase, value);
    lastRound = Object.freeze({ ...value, counts: Object.freeze({ ...value.counts }) });
    phase = controller.signal.aborted ? 'draining' : result.code === 'FAILED' ? 'failed' : 'idle';
    void send('HEARTBEAT');
  }
  function finish() {
    finishPromise ??= (async () => {
      requestStop(); finished = true; phase = 'stopped';
      clearInterval(heartbeatTimer); clearTimeout(bootTimer);
      process.off('SIGINT', requestStop); process.off('SIGTERM', requestStop);
      if (managed) { process.off('message', receive); process.off('disconnect', requestStop); }
      await send('STOPPED');
      if (managed && process.connected) process.disconnect();
    })();
    return finishPromise;
  }
  process.on('SIGINT', requestStop); process.on('SIGTERM', requestStop);
  if (managed) {
    process.on('message', receive); process.on('disconnect', requestStop);
    bootTimer = setTimeout(() => fail(Object.assign(new Error('WORKER_BOOT_TIMEOUT'), { code: 'WORKER_BOOT_TIMEOUT' })), 10_000);
    if (!process.connected) requestStop();
  }
  return { managed, initialized, signal: controller.signal, setPhase, round, requestStop, finish };
}
