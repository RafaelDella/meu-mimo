import { execFile } from 'node:child_process';
import { readFile, readlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { assertProcessIdentity } from './process-contract.mjs';

const execute = promisify(execFile);
const error = code => Object.assign(new Error(code), { code });
function pidNumber(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2_147_483_647) throw error('PROCESS_IDENTITY_INVALID_PID');
}
function linuxStart(stat, pid) {
  const end = stat.lastIndexOf(')');
  const fields = stat.slice(end + 2).trim().split(/\s+/);
  if (!stat.startsWith(`${pid} (`) || end < 0 || !/^\d+$/.test(fields[19] ?? '')) {
    throw error('PROCESS_IDENTITY_UNAVAILABLE');
  }
  return { ticks: fields[19], exited: ['Z', 'X'].includes(fields[0]) };
}
async function linuxProcess(pid) {
  const directory = `/proc/${pid}`;
  try {
    const first = linuxStart(await readFile(`${directory}/stat`, 'utf8'), pid);
    if (first.exited) return null;
    const executable = await readlink(`${directory}/exe`);
    const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    const last = linuxStart(await readFile(`${directory}/stat`, 'utf8'), pid);
    if (first.ticks !== last.ticks) throw error('PROCESS_IDENTITY_UNSTABLE');
    if (last.exited) return null;
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(boot)) throw error('PROCESS_IDENTITY_UNAVAILABLE');
    return { pid, creationTime: `linux:${boot}:${first.ticks}`, executable };
  } catch (caught) {
    if (caught.code === 'ENOENT' || caught.code === 'ESRCH') {
      // An executable may disappear while the process remains alive: do not classify that as an exit.
      try {
        const remaining = linuxStart(await readFile(`${directory}/stat`, 'utf8'), pid);
        if (!remaining.exited) throw error('PROCESS_IDENTITY_UNAVAILABLE');
      } catch (current) { if (!['ENOENT', 'ESRCH'].includes(current.code)) throw current; }
      return null;
    }
    throw caught;
  }
}
async function windowsProcess(pid) {
  const script = `$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try { $observed=[Diagnostics.Process]::GetProcessById(${pid}) }
catch [ArgumentException] { [Console]::Write('null'); exit 0 }
try {
  $started=$observed.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
  $executable=$observed.MainModule.FileName
  if($observed.HasExited){[Console]::Write('null');exit 0}
  $again=[Diagnostics.Process]::GetProcessById(${pid})
  try {
    if($again.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) -ne $started){throw 'unstable'}
  } finally {$again.Dispose()}
  [Console]::Write((@{pid=${pid};creationTime=('win32:'+$started);executable=$executable}|ConvertTo-Json -Compress))
} catch {
  if($observed.HasExited){[Console]::Write('null')}else{throw}
} finally {$observed.Dispose()}`;
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!systemRoot || !path.win32.isAbsolute(systemRoot)) throw error('PROCESS_IDENTITY_UNAVAILABLE');
  const binary = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = await execute(binary, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 10_000, maxBuffer: 128 * 1024 });
  return JSON.parse(result.stdout.trim().replace(/^\uFEFF/, ''));
}

/** A creation token is native and opaque; it is never converted to JS milliseconds. */
export async function observeProcess(pid) {
  pidNumber(pid);
  try {
    const value = process.platform === 'win32' ? await windowsProcess(pid)
      : process.platform === 'linux' ? await linuxProcess(pid) : (() => { throw error('PROCESS_IDENTITY_UNSUPPORTED'); })();
    return value === null ? null : assertProcessIdentity(value);
  } catch (caught) {
    if (caught.code === 'PROCESS_IDENTITY_UNSUPPORTED' || caught.code === 'PROCESS_IDENTITY_UNSTABLE') throw caught;
    throw error('PROCESS_IDENTITY_UNAVAILABLE');
  }
}
export async function sameProcess(expected) {
  assertProcessIdentity(expected);
  const actual = await observeProcess(expected.pid);
  const executable = value => process.platform === 'win32' ? path.win32.normalize(value).toLowerCase() : value;
  return actual !== null && actual.creationTime === expected.creationTime
    && executable(actual.executable) === executable(expected.executable);
}
