export const MAX_ARCHIVE_JSON_BYTES = 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_NODES = 100_000;

// Limit before joining/encoding, and reject executable toJSON/getter behavior.
export function encodeArchiveJson(value) {
  const chunks = [];
  const parents = new Set();
  let bytes = 0;
  let nodes = 0;
  const append = token => {
    bytes += Buffer.byteLength(token);
    if (bytes > MAX_ARCHIVE_JSON_BYTES) throw new Error('JSON limit');
    chunks.push(token);
  };
  const quoted = text => {
    if (Buffer.byteLength(text) > MAX_ARCHIVE_JSON_BYTES) throw new Error('JSON limit');
    return JSON.stringify(text);
  };
  const visit = (current, depth) => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error('JSON limit');
    if (current === null) return append('null');
    if (typeof current === 'string') return append(quoted(current));
    if (typeof current === 'boolean') return append(String(current));
    if (typeof current === 'number' && Number.isFinite(current)) return append(String(current));
    if (typeof current !== 'object' || parents.has(current)) throw new Error('Invalid JSON');
    const array = Array.isArray(current);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(current))) throw new Error('Invalid JSON');
    if (array && current.length > MAX_NODES) throw new Error('JSON limit');
    parents.add(current);
    append(array ? '[' : '{');
    const keys = array ? Array.from({ length: current.length }, (_, index) => String(index)) : Object.keys(current);
    if (keys.length > MAX_NODES) throw new Error('JSON limit');
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('Invalid JSON');
      if (index) append(',');
      if (!array) { append(quoted(key)); append(':'); }
      visit(descriptor.value, depth + 1);
    }
    append(array ? ']' : '}');
    parents.delete(current);
  };
  visit(value, 0);
  return Buffer.from(chunks.join(''), 'utf8');
}

export function decodeArchiveJson(bytes) {
  if (bytes.length > MAX_ARCHIVE_JSON_BYTES) throw new Error('JSON limit');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  encodeArchiveJson(value);
  return value;
}
