import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, realpath, readdir, mkdir, open, readFile, rename, unlink, link } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WORKSHOP_SOURCE_DIR = 'assets/chapter-one/workshop';
export const WORKSHOP_PACK_DIR = 'assets/chapter-one/workshop-models';
export const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const MANIFEST = `${WORKSHOP_PACK_DIR}/manifest.json`;
const HASH = /^[a-f0-9]{64}$/;
const noFollowRead = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
const sha256 = data => createHash('sha256').update(data).digest('hex');
const fail = message => { throw new Error(`Workshop assets: ${message}`); };

async function optionalStat(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function canonicalRoot(root) {
  const path = await realpath(resolve(root));
  if (!(await lstat(path)).isDirectory()) fail('root must be a directory');
  return path;
}
function relativeParts(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) fail('invalid relative path');
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) fail('relative path traversal');
  return parts;
}
async function checkedPath(root, relativePath) {
  const parts = relativeParts(relativePath); let path = root;
  for (let index = 0; index < parts.length; index++) {
    path = join(path, parts[index]);
    const info = await optionalStat(path);
    if (info?.isSymbolicLink()) fail(`symbolic links are not allowed: ${relativePath}`);
    if (info && index < parts.length - 1 && !info.isDirectory()) fail(`non-directory parent: ${relativePath}`);
  }
  if (!path.startsWith(root + sep)) fail('path escaped root');
  return path;
}
async function ensureDirectory(root, path) {
  const absolute = await checkedPath(root, path);
  await mkdir(absolute, { recursive: true });
  await checkedPath(root, path);
  if (!(await lstat(absolute)).isDirectory()) fail(`not a directory: ${path}`);
  return absolute;
}
async function digestFile(path) {
  const file = await open(path, noFollowRead);
  try {
    if (!(await file.stat()).isFile()) fail('expected a regular file');
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(256 * 1024); let size = 0;
    for (;;) { const { bytesRead } = await file.read(buffer, 0, buffer.length, null); if (!bytesRead) break; hash.update(buffer.subarray(0, bytesRead)); size += bytesRead; }
    return { size, sha256: hash.digest('hex') };
  } finally { await file.close(); }
}
async function verifyFile(path, expected, description) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== expected.size) fail(`file size/type mismatch: ${description}`);
  const actual = await digestFile(path);
  if (actual.size !== expected.size || actual.sha256 !== expected.sha256) fail(`checksum mismatch: ${description}`);
}
async function removeIfPresent(path) { try { await unlink(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
async function writeAll(file, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await file.write(buffer, offset, buffer.length - offset, null);
    if (!bytesWritten) fail('short write'); offset += bytesWritten;
  }
}
function chunkRelative(hash) { if (!HASH.test(hash)) fail('invalid chunk hash'); return `${WORKSHOP_PACK_DIR}/blobs/${hash}.part`; }

async function sourceFiles(root) {
  const result = [];
  async function walk(path) {
    const absolute = await checkedPath(root, path);
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const child = `${path}/${entry.name}`; await checkedPath(root, child);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) { if (/\.glb$/i.test(entry.name)) result.push(child); }
      else fail(`unsupported source entry: ${child}`);
    }
  }
  await walk(WORKSHOP_SOURCE_DIR); result.sort();
  if (!result.length) fail('no source GLB files found');
  return result;
}

function validateManifest(manifest) {
  if (!manifest || manifest.version !== 1 || !Number.isSafeInteger(manifest.chunkBytes) || manifest.chunkBytes < 1 || manifest.chunkBytes > MAX_CHUNK_BYTES) fail('unsupported manifest');
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 10000) fail('invalid file list');
  const paths = new Set();
  for (const file of manifest.files) {
    relativeParts(file?.path);
    if (!file.path.startsWith(WORKSHOP_SOURCE_DIR + '/') || !/\.glb$/i.test(file.path) || paths.has(file.path)) fail('invalid or duplicate model path');
    paths.add(file.path);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || !HASH.test(file.sha256) || !Array.isArray(file.chunks)) fail('invalid model metadata');
    if (file.chunks.length !== Math.ceil(file.size / manifest.chunkBytes)) fail('inconsistent chunk count');
    let sum = 0;
    for (const [index, chunk] of file.chunks.entries()) {
      if (!chunk || !HASH.test(chunk.sha256) || !Number.isSafeInteger(chunk.size) || chunk.size < 1 || chunk.size > manifest.chunkBytes) fail('invalid chunk metadata');
      if (index < file.chunks.length - 1 && chunk.size !== manifest.chunkBytes) fail('noncanonical chunk boundary');
      sum += chunk.size;
    }
    if (sum !== file.size) fail('inconsistent model size');
  }
  return manifest;
}

/** Read-only with respect to all source GLBs. At most one 4 MiB model chunk is buffered. */
export async function packWorkshopAssets({ root = process.cwd(), chunkBytes = MAX_CHUNK_BYTES } = {}) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > MAX_CHUNK_BYTES) fail('chunkBytes must be between 1 byte and 4 MiB');
  root = await canonicalRoot(root);
  const originals = await sourceFiles(root), manifest = { version: 1, chunkBytes, files: [] }, stored = new Map();
  await ensureDirectory(root, `${WORKSHOP_PACK_DIR}/blobs`);
  const buffer = Buffer.allocUnsafe(chunkBytes);
  for (const path of originals) {
    const absolute = await checkedPath(root, path), file = await open(absolute, noFollowRead);
    try {
      const initial = await file.stat(); if (!initial.isFile()) fail(`source is not a regular file: ${path}`);
      const record = { path, size: 0, sha256: '', chunks: [] }, hash = createHash('sha256');
      for (;;) {
        let filled = 0;
        while (filled < chunkBytes) { const { bytesRead } = await file.read(buffer, filled, chunkBytes - filled, null); if (!bytesRead) break; filled += bytesRead; }
        if (!filled) break;
        const bytes = buffer.subarray(0, filled), chunk = { sha256: sha256(bytes), size: filled };
        hash.update(bytes); record.size += filled; record.chunks.push(chunk);
        if (!stored.has(chunk.sha256)) {
          const destination = await checkedPath(root, chunkRelative(chunk.sha256));
          if (await optionalStat(destination)) await verifyFile(destination, chunk, 'existing chunk ' + chunk.sha256);
          else {
            const temporary = destination + `.${randomUUID()}.tmp`; let output;
            try {
              output = await open(temporary, 'wx', 0o644); await writeAll(output, bytes); await output.sync(); await output.close(); output = null;
              // Content-addressed blocks are immutable. An atomic no-clobber link
              // also handles another pack process producing the same block.
              try { await link(temporary, destination); } catch (error) { if (error.code !== 'EEXIST') throw error; await verifyFile(destination, chunk, 'concurrent chunk ' + chunk.sha256); }
            } finally { await output?.close(); await removeIfPresent(temporary); }
          }
          stored.set(chunk.sha256, chunk.size);
        }
      }
      record.sha256 = hash.digest('hex');
      const final = await file.stat();
      if (record.size !== initial.size || final.size !== initial.size || final.mtimeMs !== initial.mtimeMs || final.ctimeMs !== initial.ctimeMs) fail(`source changed during packing: ${path}`);
      manifest.files.push(record);
    } finally { await file.close(); }
  }
  validateManifest(manifest);
  const destination = await checkedPath(root, MANIFEST), temporary = destination + `.${randomUUID()}.tmp`; let output;
  try {
    output = await open(temporary, 'wx', 0o644); await output.writeFile(JSON.stringify(manifest, null, 2) + '\n'); await output.sync(); await output.close(); output = null;
    await checkedPath(root, MANIFEST); await rename(temporary, destination);
  } finally { await output?.close(); await removeIfPresent(temporary); }
  return { files: manifest.files.length, uniqueModels: new Set(manifest.files.map(f => f.sha256)).size, chunks: stored.size, sourceBytes: manifest.files.reduce((n, f) => n + f.size, 0), storedBytes: [...stored.values()].reduce((a, b) => a + b, 0), manifestPath: MANIFEST };
}

/** Verify existing originals; reconstruct only missing files, never repair/overwrite an inconsistent one. */
export async function restoreWorkshopAssets({ root = process.cwd() } = {}) {
  root = await canonicalRoot(root);
  const manifestPath = await checkedPath(root, MANIFEST), manifestInfo = await lstat(manifestPath);
  if (!manifestInfo.isFile() || manifestInfo.size > 8 * 1024 * 1024) fail('invalid manifest file');
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8'))), missing = [], chunks = new Map();
  // Check every original before publishing anything. A modified owned file is a
  // hard error, even when some other originals are missing and could be rebuilt.
  for (const file of manifest.files) {
    const destination = await checkedPath(root, file.path), info = await optionalStat(destination);
    if (info) { if (!info.isFile()) fail(`original is not a regular file: ${file.path}`); await verifyFile(destination, file, file.path); }
    else { missing.push(file); for (const chunk of file.chunks) { const prior = chunks.get(chunk.sha256); if (prior && prior.size !== chunk.size) fail('conflicting chunk sizes'); chunks.set(chunk.sha256, chunk); } }
  }
  // A corrupted or absent chunk fails before creating temporary originals.
  for (const chunk of chunks.values()) await verifyFile(await checkedPath(root, chunkRelative(chunk.sha256)), chunk, 'chunk ' + chunk.sha256);
  let restored = 0;
  for (const file of missing) {
    await ensureDirectory(root, file.path.slice(0, file.path.lastIndexOf('/')));
    const destination = await checkedPath(root, file.path), temporary = destination + `.${randomUUID()}.restore.tmp`, lockPath = destination + '.restore.lock';
    let lock, output;
    try {
      lock = await open(lockPath, 'wx', 0o600);
      // Another cooperating restore may have completed since the preflight.
      if (await optionalStat(destination)) { await checkedPath(root, file.path); await verifyFile(destination, file, file.path); continue; }
      output = await open(temporary, 'wx', 0o644); const hash = createHash('sha256'); let size = 0;
      for (const chunk of file.chunks) {
        const path = await checkedPath(root, chunkRelative(chunk.sha256)), input = await open(path, noFollowRead); let bytes;
        try { const info = await input.stat(); if (!info.isFile() || info.size !== chunk.size) fail('chunk size changed during restore'); bytes = await input.readFile(); } finally { await input.close(); }
        if (bytes.length !== chunk.size || sha256(bytes) !== chunk.sha256) fail('chunk changed during restore');
        hash.update(bytes); size += bytes.length; await writeAll(output, bytes);
      }
      if (size !== file.size || hash.digest('hex') !== file.sha256) fail(`reconstructed checksum mismatch: ${file.path}`);
      await output.sync(); await output.close(); output = null;
      // Verify the actual temporary file, not only the buffers sent to write().
      await verifyFile(temporary, file, 'temporary ' + file.path);
      await checkedPath(root, file.path);
      if (await optionalStat(destination)) fail(`destination appeared during restore: ${file.path}`);
      await rename(temporary, destination); restored++;
    } finally {
      await output?.close(); await removeIfPresent(temporary);
      if (lock) { await lock.close(); await removeIfPresent(lockPath); }
    }
  }
  return { files: manifest.files.length, verified: manifest.files.length, restored, existing: manifest.files.length - restored, uniqueModels: new Set(manifest.files.map(f => f.sha256)).size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const operation = process.argv[2];
    if (!['pack', 'restore'].includes(operation) || process.argv.length > 4) fail('usage: node scripts/workshop-assets.mjs pack|restore [root]');
    const options = process.argv[3] ? { root: process.argv[3] } : {};
    console.log(JSON.stringify(await (operation === 'pack' ? packWorkshopAssets(options) : restoreWorkshopAssets(options))));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
