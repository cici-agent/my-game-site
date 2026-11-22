import { createHash } from 'node:crypto';

export class StoreError extends Error {
  constructor(code, message = code) { super(message); this.name = 'StoreError'; this.code = code; }
}
export const fail = (code, message) => { throw new StoreError(code, message); };
export function identifier(value, label = 'id') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value)
      || ['__proto__', 'prototype', 'constructor'].includes(value)) fail('INVALID_ID', label);
  return value;
}
export function exactKeys(value, keys, label = 'object') {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_PAYLOAD', label);
  if (Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail('INVALID_FIELDS', label);
}
export function nonnegativeInteger(value, label = 'number') {
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_NUMBER', label);
  return value;
}

// Canonical JSON is also the boundary check: no getters, exotic prototypes,
// prototype keys, sparse arrays or values that JSON would silently discard.
export function canonicalJson(value, { maxBytes = 65536, maxNodes = 10000 } = {}) {
  let visited = 0;
  const walk = (v, depth) => {
    if (++visited > maxNodes || depth > 32) fail('PAYLOAD_TOO_LARGE');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') { if (v.length > 65536) fail('PAYLOAD_TOO_LARGE'); return v; }
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER) fail('INVALID_NUMBER');
      return Object.is(v, -0) ? 0 : v;
    }
    if (Array.isArray(v)) {
      if (v.length > maxNodes || Object.keys(v).length !== v.length
          || Object.getOwnPropertySymbols(v).length) fail('INVALID_PAYLOAD');
      const out = [];
      for (let i = 0; i < v.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(v, String(i));
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('INVALID_PAYLOAD');
        out.push(walk(descriptor.value, depth + 1));
      }
      return out;
    }
    if (!v || typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail('INVALID_PAYLOAD');
    const out = Object.create(null);
    if (Object.getOwnPropertyNames(v).length !== Object.keys(v).length) fail('INVALID_PAYLOAD');
    for (const k of Object.keys(v).sort()) {
      if (['__proto__', 'prototype', 'constructor'].includes(k)) fail('INVALID_FIELDS');
      const descriptor = Object.getOwnPropertyDescriptor(v, k);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('INVALID_PAYLOAD');
      out[k] = walk(descriptor.value, depth + 1);
    }
    if (Object.getOwnPropertySymbols(v).length) fail('INVALID_PAYLOAD');
    return out;
  };
  const text = JSON.stringify(walk(value, 0));
  if (Buffer.byteLength(text) > maxBytes) fail('PAYLOAD_TOO_LARGE');
  return text;
}
export const payloadDigest = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
export const jsonClone = value => JSON.parse(canonicalJson(value));
export function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

export function displayName(value) {
  if (typeof value !== 'string') fail('INVALID_NAME');
  const name = value.normalize('NFC').trim();
  if (!name || [...name].length > 20 || /[\u0000-\u001f\u007f]/u.test(name)) fail('INVALID_NAME');
  return name;
}
