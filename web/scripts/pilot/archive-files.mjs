import { constants } from 'node:fs';
import { lstat, open, mkdir, link, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { ensurePrivateDirectory } from './custody.mjs';

const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino;
const noFollow = constants.O_NOFOLLOW ?? 0;

export function archiveFilename(value, extension) {
  if (typeof value !== 'string' || value.length > 220
    || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*\.[a-z]+$/.test(value)
    || !value.endsWith(extension) || path.basename(value) !== value
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(value)) throw new Error('Invalid entry');
  return value;
}

export async function archiveDirectory(value) {
  if (typeof value !== 'string' || value.includes('\0') || !path.isAbsolute(value)
    || value.split(/[\\/]/).some(part => part === '.' || part === '..')) throw new Error('Invalid directory');
  const directory = path.resolve(value);
  const root = path.parse(directory).root;
  let current = root;
  for (const part of ['', ...directory.slice(root.length).split(path.sep).filter(Boolean)]) {
    if (part) {
      if (part.includes(':')) throw new Error('Invalid directory');
      current = path.join(current, part);
    }
    const observed = await lstat(current);
    if (!observed.isDirectory() || observed.isSymbolicLink()) throw new Error('Invalid directory');
  }
  return directory;
}

async function regularFile(filename) {
  const observed = await lstat(filename);
  if (!observed.isFile() || observed.isSymbolicLink()) throw new Error('Invalid file');
  return observed;
}

export async function openArchiveFile(directory, file) {
  const parent = await archiveDirectory(directory);
  archiveFilename(file, '.gcm');
  const filename = path.join(parent, file);
  const before = await regularFile(filename);
  let handle;
  try {
    handle = await open(filename, constants.O_RDONLY | noFollow);
    const observed = await handle.stat();
    if (!observed.isFile() || !sameFile(before, observed)) throw new Error('Changed file');
    await archiveDirectory(parent);
    if (!sameFile(observed, await regularFile(filename))) throw new Error('Changed file');
    return { handle, observed, filename, parent };
  } catch (error) {
    await handle?.close().catch(() => {});
    throw error;
  }
}

export async function privateArchiveFile(directory) {
  await ensurePrivateDirectory(directory);
  const parent = await archiveDirectory(directory);
  const folder = path.join(parent, `.t14-archive-${randomUUID()}.partial`);
  const owned = { parent, folder, filename: path.join(folder, 'payload.partial') };
  try {
    await mkdir(folder, { mode: 0o700 });
    owned.folderIdentity = await lstat(folder);
    await archiveDirectory(folder);
    owned.handle = await open(owned.filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
    owned.fileIdentity = await owned.handle.stat();
    if (!owned.fileIdentity.isFile()) throw new Error('Invalid temporary file');
    await assertOwned(owned);
    return owned;
  } catch (error) {
    await discardArchiveFile(owned);
    throw error;
  }
}

async function assertOwned(owned) {
  await archiveDirectory(owned.parent);
  await archiveDirectory(owned.folder);
  if (!sameFile(owned.folderIdentity, await lstat(owned.folder))
    || !sameFile(owned.fileIdentity, await regularFile(owned.filename))) throw new Error('Changed temporary file');
}

export function archiveWriter(handle) {
  return new Writable({
    write(chunk, encoding, callback) {
      writeChunk(handle, chunk).then(() => callback(), callback);
    },
    final(callback) {
      handle.sync().then(() => callback(), callback);
    },
  });
}

async function writeChunk(handle, chunk) {
  let offset = 0;
  while (offset < chunk.length) {
    const result = await handle.write(chunk, offset, chunk.length - offset, null);
    if (!result.bytesWritten) throw new Error('Incomplete write');
    offset += result.bytesWritten;
  }
}

export async function* archiveChunks(handle) {
  for (;;) {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
    if (!bytesRead) return;
    yield buffer.subarray(0, bytesRead);
  }
}

export async function publishArchiveFile(owned, file) {
  archiveFilename(file, file.endsWith('.gcm') ? '.gcm' : '.plain');
  await assertOwned(owned);
  await owned.handle.close();
  owned.handle = undefined;
  const filename = path.join(owned.parent, file);
  // link is an atomic, exclusive publication; rename could replace an unknown file.
  await link(owned.filename, filename);
  owned.published = filename;
  await assertOwned(owned);
  if (!sameFile(owned.fileIdentity, await regularFile(filename))) throw new Error('Changed publication');
  await unlink(owned.filename);
  await rmdir(owned.folder);
  return filename;
}

async function removeOwnedFile(filename, identity) {
  if (!filename || !identity) return;
  const observed = await lstat(filename);
  if (observed.isFile() && !observed.isSymbolicLink() && sameFile(identity, observed)) await unlink(filename);
}

export async function discardArchiveFile(owned) {
  if (!owned) return;
  await owned.handle?.close().catch(() => {});
  try {
    await archiveDirectory(owned.parent);
    await removeOwnedFile(owned.published, owned.fileIdentity);
    if (!owned.folderIdentity) return;
    await archiveDirectory(owned.folder);
    if (!sameFile(owned.folderIdentity, await lstat(owned.folder))) return;
    await removeOwnedFile(owned.filename, owned.fileIdentity).catch(() => {});
    // Never recurse: an unknown entry must survive even in our temporary folder.
    await rmdir(owned.folder);
  } catch {
    // A changed path is left untouched rather than following it during cleanup.
  }
}
