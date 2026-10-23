import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { custodyRoot, readPrivateJson, writePrivateJson } from './custody.mjs';
import { HEALTH_CODES, ROUND_COUNT_KEYS } from './process-contract.mjs';
import { adminRoutes, adminResults } from '../../src/server/admin/diagnostic-types.ts';

const codes = ['LOCAL_STARTING', 'LOCAL_READY', 'LOCAL_MAINTENANCE', 'LOCAL_STOPPING', 'LOCAL_STOPPED',
  'LOCAL_FAILED', 'LOCAL_MAINTENANCE_COMPLETE', ...HEALTH_CODES];
const countKeys = [...ROUND_COUNT_KEYS, 'backups', 'exports', 'logs', 'preserved', 'components', 'bytes'];
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const failure = () => Object.assign(new Error('LOCAL_DIAGNOSTIC_WRITE_FAILED'), { code: 'LOCAL_DIAGNOSTIC_WRITE_FAILED' });
const validCounts = (counts, allowed) => object(counts) && Object.entries(counts).every(([key, value]) =>
  allowed.includes(key) && Number.isSafeInteger(value) && value >= 0);
const adminCodes = new Set(adminRoutes.flatMap(route => adminResults.map(result => `T13_${route}_${result}`)));

export function knownLocalLog(value, id) {
  if (!object(value) || Object.keys(value).sort().join() !== 'code,counts,createdAt,expiresAt,formatVersion,id,kind'
    || value.formatVersion !== 1 || value.kind !== 'log' || value.id !== id || !UUID.test(id)
    || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.expiresAt))
    || new Date(value.createdAt).toISOString() !== value.createdAt || new Date(value.expiresAt).toISOString() !== value.expiresAt
    || Date.parse(value.expiresAt) !== Date.parse(value.createdAt) + 7 * 86_400_000) return false;
  if (codes.includes(value.code)) return validCounts(value.counts, countKeys);
  return adminCodes.has(value.code) && validCounts(value.counts, ['status', 'durationMs'])
    && Object.keys(value.counts).length === 2 && value.counts.status >= 100 && value.counts.status <= 599;
}

async function persist({ id, code, counts, now }) {
  const createdAt = now.toISOString();
  const value = { formatVersion: 1, kind: 'log', id, createdAt,
    expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(), code, counts };
  const file = path.join(custodyRoot, 'logs', `${id}.json`);
  try {
    try {
      const existing = await readPrivateJson(file);
      if (knownLocalLog(existing, id) && existing.code === code
        && JSON.stringify(existing.counts) === JSON.stringify(counts)
        && Date.parse(existing.expiresAt) === Date.parse(existing.createdAt) + 7 * 86_400_000
        && Object.keys(existing).sort().join() === Object.keys(value).sort().join()) return;
      throw failure();
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writePrivateJson(file, value, { exclusive: true });
  } catch { throw failure(); }
}

export async function writeLocalLog({ code, counts = {}, now = new Date() } = {}) {
  if (!codes.includes(code) || !validCounts(counts, countKeys) || !(now instanceof Date) || !Number.isFinite(now.getTime())) return;
  await persist({ id: randomUUID(), code, counts, now });
}

export async function writeAdminDiagnostic(value) {
  if (!object(value) || Object.keys(value).sort().join() !== 'correlationId,durationMs,result,route,status'
    || !adminRoutes.includes(value.route) || !adminResults.includes(value.result)
    || !Number.isInteger(value.status) || value.status < 100 || value.status > 599
    || !Number.isFinite(value.durationMs) || value.durationMs < 0 || !Number.isSafeInteger(Math.round(value.durationMs))
    || typeof value.correlationId !== 'string' || !UUID.test(value.correlationId.toLowerCase())) return;
  await persist({ id: value.correlationId.toLowerCase(), code: `T13_${value.route}_${value.result}`,
    counts: { status: value.status, durationMs: Math.round(value.durationMs) }, now: new Date() });
}
