import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { packWorkshopAssets, restoreWorkshopAssets } from '../scripts/workshop-assets.mjs';

const source = 'assets/chapter-one/workshop';
const packed = 'assets/chapter-one/workshop-models';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = root => join(root, packed, 'manifest.json');
const chunkPath = (root, sha256) => join(root, packed, 'blobs', `${sha256}.part`);
const absent = async path => { await assert.rejects(stat(path), { code: 'ENOENT' }); };

async function fixture(t, files = { [`${source}/published/harry.glb`]: Buffer.from('01234567ABCDEFGHijklmnopTAIL') }) {
  const root = await mkdtemp(join(tmpdir(), 'stone-workshop-pack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, bytes] of Object.entries(files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), bytes); }
  return { root, files };
}
async function pack(t, files) {
  const setup = await fixture(t, files);
  await packWorkshopAssets({ root: setup.root, chunkBytes: 8 });
  return { ...setup, manifest: JSON.parse(await readFile(manifestPath(setup.root), 'utf8')) };
}
async function saveManifest(root, manifest) { await writeFile(manifestPath(root), JSON.stringify(manifest)); }

test('workshop pack is content addressed, deduplicates models and preserves original bytes', async t => {
  const shared = Buffer.from('01234567ABCDEFGHijklmnopTAIL');
  const files = {
    [`${source}/published/harry.glb`]: shared,
    [`${source}/archive/harry.glb`]: shared,
    [`${source}/published/hermione.glb`]: Buffer.from('01234567newbytes-different'),
  };
  const { root } = await fixture(t, files), before = new Map();
  for (const path of Object.keys(files)) before.set(path, await stat(join(root, path)));
  await packWorkshopAssets({ root, chunkBytes: 8 });
  const manifest = JSON.parse(await readFile(manifestPath(root), 'utf8'));
  assert.equal(manifest.version, 1); assert.equal(manifest.chunkBytes, 8); assert.equal(manifest.files.length, 3);
  const expectedChunks = new Set();
  for (const record of manifest.files) {
    const original = files[record.path]; assert(original, 'manifest path must refer to a fixture original');
    assert.equal(record.size, original.length); assert.equal(record.sha256, digest(original));
    const assembled = [];
    for (const chunk of record.chunks) {
      const bytes = await readFile(chunkPath(root, chunk.sha256));
      assert.equal(chunk.size, bytes.length); assert(chunk.size <= 8); assert.equal(chunk.sha256, digest(bytes));
      expectedChunks.add(`${chunk.sha256}.part`); assembled.push(bytes);
    }
    assert.deepEqual(Buffer.concat(assembled), original);
    assert.deepEqual(await readFile(join(root, record.path)), original);
    const after = await stat(join(root, record.path));
    assert.equal(after.ino, before.get(record.path).ino); assert.equal(after.mtimeMs, before.get(record.path).mtimeMs);
  }
  const aliases = manifest.files.filter(f => f.path.endsWith('/harry.glb'));
  assert.deepEqual(aliases[0].chunks, aliases[1].chunks);
  assert.deepEqual((await readdir(join(root, packed, 'blobs'))).sort(), [...expectedChunks].sort());
  assert(expectedChunks.size < manifest.files.reduce((sum, f) => sum + f.chunks.length, 0));
});

test('missing originals restore exactly and valid originals are subsequently checked without rewriting', async t => {
  const { root, files } = await pack(t);
  for (const path of Object.keys(files)) await rm(join(root, path));
  await restoreWorkshopAssets({ root });
  const before = new Map();
  for (const [path, bytes] of Object.entries(files)) { assert.deepEqual(await readFile(join(root, path)), bytes); before.set(path, await stat(join(root, path))); }
  await restoreWorkshopAssets({ root });
  for (const path of Object.keys(files)) {
    const after = await stat(join(root, path));
    assert.equal(after.ino, before.get(path).ino); assert.equal(after.mtimeMs, before.get(path).mtimeMs);
  }
});

test('an inconsistent existing original is rejected and never replaced', async t => {
  const { root, manifest } = await pack(t), path = join(root, manifest.files[0].path);
  const changed = Buffer.from('owner-edited-original-do-not-overwrite'); await writeFile(path, changed);
  const before = await stat(path);
  await assert.rejects(restoreWorkshopAssets({ root }));
  assert.deepEqual(await readFile(path), changed); assert.equal((await stat(path)).ino, before.ino);
});

test('corrupted or missing chunks cannot leave a restored original or a partial file', async t => {
  for (const mode of ['corrupted', 'missing']) await t.test(mode, async sub => {
    const { root, manifest } = await pack(sub), file = manifest.files[0], originalPath = join(root, file.path);
    await rm(originalPath);
    const path = chunkPath(root, file.chunks.at(-1).sha256);
    if (mode === 'missing') await rm(path);
    else { const bytes = await readFile(path); bytes[0] ^= 0xff; await writeFile(path, bytes); }
    await assert.rejects(restoreWorkshopAssets({ root }));
    await absent(originalPath); assert.deepEqual(await readdir(dirname(originalPath)), []);
  });
});

test('manifest destination traversal and absolute paths are rejected', async t => {
  for (const mode of ['traversal', 'absolute']) await t.test(mode, async sub => {
    const { root, manifest } = await pack(sub), file = manifest.files[0]; await rm(join(root, file.path));
    const outside = join(dirname(root), `${basename(root)}-escaped.glb`); sub.after(() => rm(outside, { force: true }));
    file.path = mode === 'traversal' ? `../${basename(outside)}` : outside;
    await saveManifest(root, manifest);
    await assert.rejects(restoreWorkshopAssets({ root })); await absent(outside);
  });
});

test('a symlink in the restored original parent cannot escape the chosen root', async t => {
  const { root, manifest } = await pack(t), file = manifest.files[0], targetParent = dirname(join(root, file.path));
  const outside = await mkdtemp(join(tmpdir(), 'stone-workshop-outside-')); t.after(() => rm(outside, { recursive: true, force: true }));
  await rm(targetParent, { recursive: true }); await symlink(outside, targetParent, 'dir');
  await assert.rejects(restoreWorkshopAssets({ root })); await absent(join(outside, basename(file.path)));
});

test('invalid chunk identifiers and inconsistent declared sizes are rejected before publication', async t => {
  for (const mode of ['identifier', 'size']) await t.test(mode, async sub => {
    const { root, manifest } = await pack(sub), file = manifest.files[0]; await rm(join(root, file.path));
    if (mode === 'identifier') file.chunks[0].sha256 = '../outside';
    else file.chunks[0].size += 1;
    await saveManifest(root, manifest);
    await assert.rejects(restoreWorkshopAssets({ root })); await absent(join(root, file.path));
  });
});

test('pack rejects a symlinked source rather than reading a model outside the fixture', async t => {
  const { root, files } = await fixture(t), path = join(root, Object.keys(files)[0]);
  const outside = await mkdtemp(join(tmpdir(), 'stone-workshop-source-')); t.after(() => rm(outside, { recursive: true, force: true }));
  const external = join(outside, 'external.glb'); await writeFile(external, 'outside-model'); await rm(path); await symlink(external, path);
  await assert.rejects(packWorkshopAssets({ root, chunkBytes: 8 }));
  assert.equal(await readFile(external, 'utf8'), 'outside-model');
});
