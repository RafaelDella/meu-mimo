import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  archiveFilename, openArchiveFile, privateArchiveFile, archiveWriter,
  archiveChunks, publishArchiveFile, discardArchiveFile,
} from './archive-files.mjs';
import { encodeArchiveJson, decodeArchiveJson, MAX_ARCHIVE_JSON_BYTES } from './archive-json.mjs';

const FORMAT_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const invalid = () => Object.assign(new Error('Arquivo cifrado inválido ou indisponível.'), { code: 'T14_ARCHIVE_INVALID' });

function context(key, id, name) {
  if (!Buffer.isBuffer(key) || key.length !== 32 || typeof id !== 'string' || !UUID.test(id)
    || typeof name !== 'string' || !NAME.test(name)) throw invalid();
  return Buffer.from(JSON.stringify({ formatVersion: FORMAT_VERSION, id: id.toLowerCase(), name }));
}

function base64(value, length, maximum = length) {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(maximum / 3)
    || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw invalid();
  const bytes = Buffer.from(value, 'base64');
  if ((length !== undefined && bytes.length !== length) || bytes.length > maximum
    || bytes.toString('base64') !== value) throw invalid();
  return bytes;
}

function header(value) {
  if (!value || typeof value !== 'object' || value.formatVersion !== FORMAT_VERSION
    || value.algorithm !== ALGORITHM) throw invalid();
  return { nonce: base64(value.nonce, 12), tag: base64(value.tag, 16) };
}

function measure() {
  const hash = createHash('sha256');
  let bytes = 0;
  return {
    stream: new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        if (!Number.isSafeInteger(bytes)) return callback(invalid());
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    result: () => ({ bytes, sha256: hash.digest('hex') }),
  };
}

/** Encrypt a readable stream; the returned basename refers only to a completed file. */
export async function encryptComponent(input = {}) {
  let temporary;
  try {
    const { source, key, id, name, directory } = input;
    const aad = context(key, id, name);
    if (!(source instanceof Readable) || source.destroyed || source.readableEnded) throw invalid();
    temporary = await privateArchiveFile(directory);
    const nonce = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
    cipher.setAAD(aad);
    const measured = measure();
    await pipeline(source, measured.stream, cipher, archiveWriter(temporary.handle));
    const digest = measured.result();
    const tag = cipher.getAuthTag();
    const file = `${id.toLowerCase()}-${name}-${randomUUID()}.gcm`;
    const component = {
      formatVersion: FORMAT_VERSION, algorithm: ALGORITHM, name, file,
      ...digest, encryptedBytes: digest.bytes, nonce: nonce.toString('base64'), tag: tag.toString('base64'),
    };
    await publishArchiveFile(temporary, file);
    return component;
  } catch {
    await discardArchiveFile(temporary);
    throw invalid();
  }
}

/** Authenticate the complete ciphertext into private staging before publishing plaintext. */
export async function decryptComponent(input = {}) {
  let temporary;
  let source;
  try {
    const { key, id, directory, destinationDirectory } = input;
    const component = { ...input.component };
    const aad = context(key, id, component.name);
    const { nonce, tag } = header(component);
    archiveFilename(component.file, '.gcm');
    if (!Number.isSafeInteger(component.bytes) || component.bytes < 0
      || component.encryptedBytes !== component.bytes || !/^[a-f0-9]{64}$/.test(component.sha256)) throw invalid();
    source = await openArchiveFile(directory, component.file);
    if (source.observed.size !== component.encryptedBytes) throw invalid();
    temporary = await privateArchiveFile(destinationDirectory);
    const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const measured = measure();
    await pipeline(Readable.from(archiveChunks(source.handle), { objectMode: false }), decipher,
      measured.stream, archiveWriter(temporary.handle));
    const digest = measured.result();
    const after = await source.handle.stat();
    if (digest.bytes !== component.bytes || after.size !== source.observed.size
      || after.mtimeMs !== source.observed.mtimeMs || after.ctimeMs !== source.observed.ctimeMs
      || !timingSafeEqual(Buffer.from(digest.sha256, 'hex'), Buffer.from(component.sha256, 'hex'))) throw invalid();
    await source.handle.close();
    source = undefined;
    const file = await publishArchiveFile(temporary, `${id.toLowerCase()}-${component.name}-${randomUUID()}.plain`);
    return { file, ...digest };
  } catch {
    await source?.handle.close().catch(() => {});
    await discardArchiveFile(temporary);
    throw invalid();
  }
}

/** Small authenticated envelopes for manifests and suppression journals, never volume bytes. */
export function sealJson(input = {}) {
  let plaintext;
  try {
    const { value, key, id, name } = input;
    const aad = context(key, id, name);
    plaintext = encodeArchiveJson(value);
    const nonce = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      formatVersion: FORMAT_VERSION, algorithm: ALGORITHM, nonce: nonce.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64'),
    };
  } catch {
    throw invalid();
  } finally {
    plaintext?.fill(0);
  }
}

export function openJson(input = {}) {
  let plaintext;
  let pending;
  try {
    const { envelope, key, id, name } = input;
    const aad = context(key, id, name);
    const { nonce, tag } = header(envelope);
    const ciphertext = base64(envelope.ciphertext, undefined, MAX_ARCHIVE_JSON_BYTES);
    const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    pending = decipher.update(ciphertext);
    const final = decipher.final();
    plaintext = Buffer.concat([pending, final]);
    return decodeArchiveJson(plaintext);
  } catch {
    throw invalid();
  } finally {
    pending?.fill(0);
    plaintext?.fill(0);
  }
}
