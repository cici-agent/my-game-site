import { constants } from 'node:fs';
import { mkdir, realpath, lstat, open, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { identifier, StoreError, fail } from './transaction-contract.mjs';

const queues = new Map();
async function serialized(key, work) {
  const previous = queues.get(key) ?? Promise.resolve();
  let release;
  const gate = new Promise(r => { release = r; });
  const tail = previous.then(() => gate);
  queues.set(key, tail);
  await previous;
  try { return await work(); }
  finally { release(); if (queues.get(key) === tail) queues.delete(key); }
}
const clone = value => value === null ? null : JSON.parse(JSON.stringify(value));

/**
 * Replaceable production interface: withAccountTransaction(accountId, callback).
 * Callback gets an isolated JSON snapshot and returns { state, result }.
 * State + every receipt MUST commit atomically, with serializable account access.
 * Reads use the same primitive with unchanged state. Callbacks may be async.
 * An infrastructure error after the commit point is recovered by original requestId.
 */
export class MemoryAccountStorage {
  #accounts = new Map(); #id = randomUUID(); #closed = false; #pending = new Set();
  constructor({ beforeCommit } = {}) { this.beforeCommit = beforeCommit; }
  withAccountTransaction(accountId, callback) {
    identifier(accountId, 'accountId');
    if (this.#closed) return Promise.reject(new StoreError('STORAGE_CLOSED'));
    const job = serialized(`${this.#id}:${accountId}`, async () => {
      const current = clone(this.#accounts.get(accountId) ?? null);
      const before = JSON.stringify(current);
      const { state, result } = await callback(current);
      if (JSON.stringify(state) !== before) {
        await this.beforeCommit?.({ accountId, state: clone(state) });
        this.#accounts.set(accountId, clone(state));
      }
      return clone(result);
    });
    this.#pending.add(job); job.then(() => this.#pending.delete(job), () => this.#pending.delete(job));
    return job;
  }
  async close() { this.#closed = true; await Promise.allSettled([...this.#pending]); }
}

/** Real disk test adapter, not a production multi-host database. */
export class FileAccountStorage {
  #root; #ready; #closed = false; #pending = new Set();
  constructor({ directory, beforeCommit, afterCommit, lockTimeoutMs = 5000 } = {}) {
    if (typeof directory !== 'string' || !directory || directory.includes('\0')) fail('INVALID_DIRECTORY');
    if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 1 || lockTimeoutMs > 30000) fail('INVALID_TIMEOUT');
    this.beforeCommit = beforeCommit; this.afterCommit = afterCommit; this.lockTimeoutMs = lockTimeoutMs;
    this.#ready = this.#initialize(resolve(directory));
  }
  async #initialize(directory) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('UNSAFE_STORAGE_PATH');
    this.#root = await realpath(directory);
  }
  async #rejectSymlink(path) {
    try { const s = await lstat(path); if (!s.isFile() || s.isSymbolicLink()) fail('UNSAFE_STORAGE_PATH'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async #read(path, accountId) {
    await this.#rejectSymlink(path);
    let file;
    try {
      file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const text = await file.readFile('utf8');
      let state;
      try { state = JSON.parse(text); } catch { fail('CORRUPT_STORAGE'); }
      if (!state || state.accountId !== accountId || state.schemaVersion !== 1) fail('CORRUPT_STORAGE');
      return state;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    finally { await file?.close(); }
  }
  async #lock(path) {
    const deadline = Date.now() + this.lockTimeoutMs;
    while (true) {
      try { return await open(path, 'wx', 0o600); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) fail('STORAGE_BUSY');
        await new Promise(r => setTimeout(r, 5));
      }
    }
  }
  withAccountTransaction(accountId, callback) {
    identifier(accountId, 'accountId');
    if (this.#closed) return Promise.reject(new StoreError('STORAGE_CLOSED'));
    const job = this.#run(accountId, callback);
    this.#pending.add(job); job.then(() => this.#pending.delete(job), () => this.#pending.delete(job));
    return job;
  }
  async #run(accountId, callback) {
    await this.#ready;
    const basename = 'account-' + createHash('sha256').update(accountId).digest('hex');
    const path = join(this.#root, basename + '.json');
    return serialized(path, async () => {
      const lockPath = join(this.#root, basename + '.lock');
      const lock = await this.#lock(lockPath);
      try {
        const current = await this.#read(path, accountId);
        const before = JSON.stringify(current);
        const { state, result } = await callback(clone(current));
        if (JSON.stringify(state) !== before) {
          await this.beforeCommit?.({ accountId, state: clone(state) });
          await this.#rejectSymlink(path);
          const temporary = join(this.#root, basename + '.' + randomUUID() + '.tmp');
          let file;
          try {
            file = await open(temporary, 'wx', 0o600);
            await file.writeFile(JSON.stringify(state)); await file.sync(); await file.close(); file = null;
            await rename(temporary, path); // Atomic commit point: receipt and state are in the same file.
            const directory = await open(this.#root, 'r');
            try { await directory.sync(); } finally { await directory.close(); }
            await this.afterCommit?.({ accountId });
          } finally {
            await file?.close();
            await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
          }
        }
        return clone(result);
      } finally { await lock.close(); await unlink(lockPath); }
    });
  }
  async close() { this.#closed = true; await Promise.allSettled([...this.#pending]); await this.#ready; }
}
