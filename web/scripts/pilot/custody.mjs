import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { pilotResources } from './resources.mjs';

export const custodyRoot = pilotResources('development').directory;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const protectedDirectories = new Set();
const invalid = () => new Error('Custódia local indisponível ou fora do diretório reservado.');

function contained(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw invalid();
  const resolved = path.resolve(value);
  const relative = path.relative(custodyRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw invalid();
  return resolved;
}

async function noLinks(directory) {
  let current = directory;
  while (true) {
    const entry = await lstat(current);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw invalid();
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function restrictWindows(directory) {
  if (process.platform !== 'win32' || protectedDirectories.has(directory)) return;
  const encoded = Buffer.from(directory).toString('base64');
  const script = `$ErrorActionPreference='Stop'
$target=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
$security=[Security.AccessControl.DirectorySecurity]::new()
$security.SetOwner($identity)
$security.SetAccessRuleProtection($true,$false)
$inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
foreach($sid in @($identity,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){
 $rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl',$inherit,'None','Allow')
 $security.AddAccessRule($rule)
}
[IO.Directory]::SetAccessControl($target,$security)
$actual=[IO.Directory]::GetAccessControl($target)
if(-not $actual.AreAccessRulesProtected){throw 'Custody ACL is inherited'}
$allowed=@($identity.Value,'S-1-5-18','S-1-5-32-544')
foreach($rule in $actual.Access){
 $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
 if($sid -notin $allowed -or $rule.AccessControlType -ne 'Allow'){throw 'Custody ACL mismatch'}
}`;
  try {
    execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, stdio: 'pipe' });
    protectedDirectories.add(directory);
  } catch { throw invalid(); }
}

export async function ensurePrivateDirectory(value) {
  const directory = contained(value);
  // Check every existing ancestor before creation, including junctions on Windows.
  let ancestor = directory;
  while (true) {
    try { await lstat(ancestor); break; } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ancestor = path.dirname(ancestor);
    }
  }
  await noLinks(ancestor);
  await mkdir(custodyRoot, { recursive: true, mode: 0o700 });
  await noLinks(custodyRoot);
  restrictWindows(custodyRoot);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await noLinks(directory);
  restrictWindows(directory);
  return directory;
}

async function regularFile(filename) {
  const file = contained(filename);
  await ensurePrivateDirectory(path.dirname(file));
  const observed = await lstat(file);
  if (!observed.isFile() || observed.isSymbolicLink() || observed.nlink !== 1) throw invalid();
  return { file, observed };
}

export async function readPrivateJson(filename) {
  const { file, observed } = await regularFile(filename);
  if (observed.size > 2 * 1024 * 1024) throw invalid();
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function writePrivateJson(filename, value, { exclusive = false } = {}) {
  const file = contained(filename);
  await ensurePrivateDirectory(path.dirname(file));
  try { await regularFile(file); if (exclusive) throw invalid(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${file}.${randomUUID()}.partial`;
  const bytes = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(bytes) > 2 * 1024 * 1024) throw invalid();
  let handle;
  try {
    handle = await open(exclusive ? file : temporary, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close(); handle = undefined;
    if (!exclusive) await rename(temporary, file);
  } finally {
    await handle?.close();
    if (!exclusive) await rm(temporary, { force: true });
  }
}

export async function backupKey(id, { create = false } = {}) {
  if (typeof id !== 'string' || !UUID.test(id)) throw invalid();
  const directory = await ensurePrivateDirectory(path.join(custodyRoot, 'keys'));
  const file = path.join(directory, `${id.toLowerCase()}.key`);
  if (create) {
    let handle;
    try { handle = await open(file, 'wx', 0o600); await handle.writeFile(randomBytes(32)); await handle.sync(); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    finally { await handle?.close(); }
  }
  const { observed } = await regularFile(file);
  if (observed.size !== 32) throw invalid();
  const bytes = await readFile(file);
  if (bytes.length !== 32) throw invalid();
  return bytes;
}

export async function deleteBackupKey(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw invalid();
  const file = path.join(custodyRoot, 'keys', `${id.toLowerCase()}.key`);
  const { observed } = await regularFile(file);
  if (observed.size !== 32) throw invalid();
  await rm(file);
}

export async function withMaintenanceLock(operation) {
  if (typeof operation !== 'function') throw invalid();
  await ensurePrivateDirectory(custodyRoot);
  const file = path.join(custodyRoot, 'maintenance.lock');
  const owner = randomUUID();
  let handle;
  try { handle = await open(file, 'wx', 0o600); }
  catch { throw new Error('Há manutenção local em andamento ou um lock que exige conferência.'); }
  try {
    await handle.writeFile(JSON.stringify({ owner, pid: process.pid, createdAt: new Date().toISOString() }));
    await handle.sync();
    return await operation();
  } finally {
    await handle.close();
    const current = await readPrivateJson(file);
    if (current.owner !== owner) throw invalid();
    await rm(file);
  }
}
