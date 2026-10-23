import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';

const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\0.*$/s, '');
function number(bytes) {
  if (bytes[0] & 128) throw new Error('Número TAR não suportado.');
  const value = text(bytes).trim();
  if (!/^[0-7]*$/.test(value)) throw new Error('Número TAR inválido.');
  const result = value ? Number.parseInt(value, 8) : 0;
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('Limite TAR inválido.');
  return result;
}
function safeName(value, root) {
  const name = value.replace(/\/$/, '');
  if (name !== root && !name.startsWith(`${root}/`)) throw new Error('Raiz TAR divergente.');
  if (name.includes('\\') || name.includes('\0') || name.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Caminho TAR inválido.');
  }
  return name;
}

export function inspectTar(root, onRecord) {
  let header = Buffer.alloc(0); let entry; let remaining = 0; let padding = 0;
  let extension = []; let extensionBytes = 0; let pax = {}; let longName;
  let ended = false; let zeroHeaders = 0; let files = 0; let bytes = 0;
  async function finish() {
    if (!entry) return;
    if (['x', 'g', 'L'].includes(entry.type)) {
      const data = Buffer.concat(extension).toString('utf8');
      if (entry.type === 'L') longName = data.replace(/\0.*$/s, '').replace(/\n$/, '');
      else {
        let cursor = 0;
        while (cursor < data.length) {
          const space = data.indexOf(' ', cursor);
          const length = Number(data.slice(cursor, space));
          if (space < 0 || !Number.isSafeInteger(length) || length <= 0 || cursor + length > data.length) throw new Error('PAX inválido.');
          const record = data.slice(space + 1, cursor + length - 1); const equals = record.indexOf('=');
          if (equals < 1) throw new Error('PAX inválido.');
          const key = record.slice(0, equals); const value = record.slice(equals + 1);
          if (/sparse|linkpath/i.test(key)) throw new Error('Extensão TAR não suportada.');
          if (['path', 'size'].includes(key)) pax[key] = value;
          cursor += length;
        }
      }
    } else if (entry.type === '0') {
      files += 1; bytes += entry.bytes;
      if (!Number.isSafeInteger(files) || !Number.isSafeInteger(bytes)) throw new Error('Inventário TAR excedeu o limite.');
      await onRecord({ path: entry.name, bytes: entry.bytes, sha256: entry.hash.digest('hex') });
    }
    entry = undefined; extension = []; extensionBytes = 0;
  }
  async function consume(chunk) {
    let position = 0;
    while (position < chunk.length) {
      if (ended) {
        if (chunk.subarray(position).some(value => value !== 0)) throw new Error('Dados após fim TAR.');
        return;
      }
      if (remaining) {
        const count = Math.min(remaining, chunk.length - position); const piece = chunk.subarray(position, position + count);
        if (entry.type === '0') entry.hash.update(piece);
        else if (['x', 'g', 'L'].includes(entry.type)) {
          extensionBytes += piece.length;
          if (extensionBytes > 65536) throw new Error('Extensão TAR excedeu o limite.');
          extension.push(Buffer.from(piece));
        }
        remaining -= count; position += count;
        if (!remaining) await finish();
        continue;
      }
      if (padding) { const count = Math.min(padding, chunk.length - position); padding -= count; position += count; continue; }
      const count = Math.min(512 - header.length, chunk.length - position);
      header = Buffer.concat([header, chunk.subarray(position, position + count)]); position += count;
      if (header.length < 512) continue;
      if (header.every(value => value === 0)) {
        zeroHeaders += 1; header = Buffer.alloc(0);
        if (zeroHeaders === 2) ended = true;
        continue;
      }
      if (zeroHeaders) throw new Error('Fim TAR inválido.');
      const expected = number(header.subarray(148, 156));
      const actual = header.reduce((sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value), 0);
      if (actual !== expected) throw new Error('Checksum TAR inválido.');
      const type = String.fromCharCode(header[156] || 48);
      if (!['0', '5', 'x', 'g', 'L'].includes(type)) throw new Error('Entrada TAR não regular.');
      const prefix = text(header.subarray(345, 500));
      let name = `${prefix ? `${prefix}/` : ''}${text(header.subarray(0, 100))}`;
      let size = number(header.subarray(124, 136));
      if (!['x', 'g', 'L'].includes(type)) {
        name = safeName(pax.path ?? longName ?? name, root);
        if (pax.size !== undefined) {
          if (!/^\d+$/.test(pax.size) || !Number.isSafeInteger(Number(pax.size))) throw new Error('Tamanho PAX inválido.');
          size = Number(pax.size);
        }
        pax = {}; longName = undefined;
      }
      if (type === '5' && size) throw new Error('Diretório TAR inválido.');
      entry = { name, type, bytes: size, hash: type === '0' ? createHash('sha256') : undefined };
      remaining = size; padding = (512 - size % 512) % 512; header = Buffer.alloc(0);
      if (!remaining) await finish();
    }
  }
  const stream = new Transform({
    transform(chunk, encoding, callback) { consume(chunk).then(() => callback(null, chunk), callback); },
    flush(callback) {
      if (!ended || remaining || padding || header.length || entry) callback(new Error('Arquivo TAR incompleto.'));
      else callback();
    },
  });
  return { stream, counts: () => ({ files, bytes }) };
}
