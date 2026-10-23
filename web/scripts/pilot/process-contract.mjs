import path from 'node:path';

export const HEARTBEAT_MS = 5_000;
export const STALE_MS = 30_000;
export const BACKUP_INTERVAL_MS = 43_200_000;
export const DRAIN_TIMEOUT_MS = 300_000;
export const ROLES = Object.freeze(['next', 'media', 'outbox']);
export const HEALTH_CODES = Object.freeze(['SETUP_REQUIRED', 'STACK_UNAVAILABLE', 'DATABASE_UNAVAILABLE',
  'AUTH_UNAVAILABLE', 'STORAGE_UNAVAILABLE', 'NEXT_UNAVAILABLE', 'WORKER_STALE', 'WORKER_FAILED',
  'BACKUP_REQUIRED', 'BACKUP_FAILED', 'MAINTENANCE', 'PROCESS_IDENTITY_MISMATCH', 'DRAIN_TIMEOUT']);
export const ROUND_COUNT_KEYS = Object.freeze(['processed', 'failed', 'orphaned', 'expired',
  'originalsPurged', 'temporaryPurged', 'purged', 'delivered']);
const statuses = Object.freeze({ STARTING: 'starting', READY: 'ready', MAINTENANCE: 'maintenance',
  DRAINING: 'stopping', STOPPED: 'stopped', FAILED: 'failed' });
const workerPhases = ['starting', 'idle', 'busy', 'draining', 'failed', 'stopped'];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const fail = () => { throw Object.assign(new Error('PROCESS_CONTRACT_INVALID'), { code: 'PROCESS_CONTRACT_INVALID' }); };
const requireValue = condition => { if (!condition) fail(); };
function object(value) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)));
}
function exact(value, names) {
  object(value);
  requireValue(Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)));
}
function iso(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
}
function owner(value) { requireValue(typeof value === 'string' && uuid.test(value)); }
export function assertProcessIdentity(value) {
  exact(value, ['pid', 'creationTime', 'executable']);
  requireValue(integer(value.pid, 1) && value.pid <= 2_147_483_647);
  // Opaque native precision: Windows ticks or Linux boot UUID + start ticks. Never Date.parse this field.
  requireValue(typeof value.creationTime === 'string' && /^[a-zA-Z0-9:._-]{5,256}$/.test(value.creationTime));
  requireValue(typeof value.executable === 'string' && value.executable.length <= 32_768
    && !/[\u0000-\u001f\u007f]/.test(value.executable)
    && (path.posix.isAbsolute(value.executable) || path.win32.isAbsolute(value.executable)));
  return value;
}
function round(value, role) {
  if (value === null) return;
  exact(value, ['code', 'completedAt', 'durationMs', 'counts']);
  requireValue(['OK', 'FAILED'].includes(value.code) && Number.isFinite(value.durationMs) && value.durationMs >= 0);
  iso(value.completedAt); object(value.counts);
  requireValue(Object.entries(value.counts).every(([key, count]) => ROUND_COUNT_KEYS.includes(key) && integer(count)));
  if (role === 'next') requireValue(Object.keys(value.counts).length === 0);
}
function heartbeat(value, role) {
  if (value === null) return;
  exact(value, ['receivedAt', 'sequence', 'phase', 'lastRound']); iso(value.receivedAt);
  requireValue(integer(value.sequence, 1) && workerPhases.includes(value.phase)); round(value.lastRound, role);
}
function child(value, role) {
  exact(value, ['identity', 'state', 'heartbeat']); assertProcessIdentity(value.identity);
  requireValue(['starting', 'running', 'stopping', 'stopped'].includes(value.state)); heartbeat(value.heartbeat, role);
}
export function assertReceipt(value) {
  exact(value, ['formatVersion', 'owner', 'operationId', 'kind', 'manager', 'issuedAt', 'expiresAt']);
  requireValue(value.formatVersion === 1 && value.kind === 'BACKUP'); owner(value.owner); owner(value.operationId);
  assertProcessIdentity(value.manager); iso(value.issuedAt); iso(value.expiresAt);
  const duration = Date.parse(value.expiresAt) - Date.parse(value.issuedAt);
  requireValue(duration > 0 && duration <= 60_000);
  return value;
}
export function assertSnapshot(value) {
  exact(value, ['formatVersion', 'task', 'mode', 'owner', 'manager', 'phase', 'status', 'updatedAt', 'children', 'maintenance']);
  requireValue(value.formatVersion === 1 && value.task === 't14' && value.mode === 'development'); owner(value.owner);
  assertProcessIdentity(value.manager); iso(value.updatedAt);
  requireValue(Object.hasOwn(statuses, value.phase) && statuses[value.phase] === value.status); object(value.children);
  for (const [role, entry] of Object.entries(value.children)) { requireValue(ROLES.includes(role)); child(entry, role); }
  if (value.maintenance !== null) {
    const receipt = assertReceipt(value.maintenance);
    requireValue(value.phase === 'MAINTENANCE' && receipt.owner === value.owner
      && ['pid', 'creationTime', 'executable'].every(key => receipt.manager[key] === value.manager[key]));
  }
  if (value.phase === 'MAINTENANCE') requireValue(value.maintenance !== null);
  if (['MAINTENANCE', 'STOPPED'].includes(value.phase)) {
    requireValue(Object.values(value.children).every(entry => entry.state === 'stopped'));
  }
  if (value.phase === 'READY') requireValue(ROLES.every(role => value.children[role]?.state === 'running'
    && value.children[role].heartbeat !== null));
  return value;
}
export function assertParentMessage(value) {
  object(value);
  if (value.type === 'BOOT') { exact(value, ['formatVersion', 'type', 'owner', 'role']); requireValue(ROLES.includes(value.role)); }
  else { exact(value, ['formatVersion', 'type', 'owner']); requireValue(value.type === 'STOP'); }
  requireValue(value.formatVersion === 1); owner(value.owner);
  return value;
}
export function assertWorkerMessage(value) {
  exact(value, ['formatVersion', 'type', 'owner', 'role', 'pid', 'sequence', 'phase', 'lastRound']);
  requireValue(value.formatVersion === 1 && ['HEARTBEAT', 'STOPPED'].includes(value.type)); owner(value.owner);
  requireValue(ROLES.includes(value.role) && integer(value.pid, 1) && value.pid <= 2_147_483_647
    && integer(value.sequence, 1) && workerPhases.includes(value.phase));
  requireValue(value.type !== 'STOPPED' || value.phase === 'stopped'); round(value.lastRound, value.role);
  return value;
}
