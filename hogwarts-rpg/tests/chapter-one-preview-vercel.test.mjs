import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Readable, Writable, PassThrough } from 'node:stream';
import { createPreviewHandler, loadPreviewAssets, verifyPreviewAsset, PREVIEW_BACKEND } from '../scripts/preview-vercel.mjs';

const modelPath = '/assets/chapter-one/workshop/65154a9106f3/assets/3d/magic/characters/harry-pathfinder.glb';
async function fixture(t, backendRequest) {
  const scratch = await mkdtemp(join(tmpdir(), 'stone-preview-')), root = join(scratch, 'site');
  t.after(() => rm(scratch, { recursive: true, force: true })); await mkdir(root);
  await writeFile(join(root, 'index.html'), 'existing universe'); await writeFile(join(root, 'stone.html'), '<main>RPG</main>');
  await writeFile(join(scratch, 'private.json'), 'outside root'); await symlink(join(scratch, 'private.json'), join(root, 'escaped.json'));
  const file = join(root, 'frozen.glb'), bytes = Buffer.from('glTF fixture'); await writeFile(file, bytes);
  const asset = await verifyPreviewAsset(file, createHash('sha256').update(bytes).digest('hex'), bytes.length);
  const handler = await createPreviewHandler({ siteRoot: root, assetMap: new Map([[modelPath, asset]]), backendRequest });
  return { handler, root, file, bytes };
}
function invoke(handler, url, { method = 'GET', headers = {}, body = '' } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []); Object.assign(req, { url, method, headers: { host: 'untrusted.example', ...headers } });
  const chunks = [], res = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  res.writeHead = (status, responseHeaders) => { res.status = status; res.headers = responseHeaders; res.headersSent = true; };
  return new Promise((resolve, reject) => { res.on('finish', () => resolve({ status: res.status, headers: res.headers, body: Buffer.concat(chunks) })); res.on('error', reject); Promise.resolve(handler(req, res)).catch(reject); });
}

test('preview serves the existing site and exact frozen model mapping without changing bytes', async t => {
  const f = await fixture(t);
  assert.equal((await invoke(f.handler, '/')).body.toString(), 'existing universe');
  assert.equal((await invoke(f.handler, '/stone.html?qa=audio')).body.toString(), '<main>RPG</main>');
  const model = await invoke(f.handler, modelPath); assert.equal(model.status, 200); assert.deepEqual(model.body, f.bytes); assert.equal(model.headers['Content-Type'], 'model/gltf-binary');
  const head = await invoke(f.handler, modelPath, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers['Content-Length'], f.bytes.length);
  assert.deepEqual(await readFile(f.file), f.bytes);
  assert.equal((await invoke(f.handler, modelPath.replace('65154a9106f3','unknown'))).status, 404);
});

test('static preview rejects traversal, source metadata, symlink escapes, and writes', async t => {
  let outbound = 0; const f = await fixture(t, () => { outbound++; throw new Error('Must not proxy'); });
  for (const url of ['/../private.json', '/%2e%2e/private.json', '/api/stone/../private.json', '/%5cprivate.json', '//evil.example/api/stone/account']) assert.equal((await invoke(f.handler, url)).status, 400, url);
  for (const url of ['/.git/config', '/hogwarts-rpg/chapter-one/client/app.mjs', '/node_modules/three/package.json', '/escaped.json', '/api/anything']) assert.equal((await invoke(f.handler, url)).status, 404, url);
  assert.equal((await invoke(f.handler, '/stone.html', { method: 'POST', body: 'no' })).status, 405); assert.equal(outbound, 0);
});

test('only the fixed RPG backend receives requests; authorization, query and body survive unchanged', async t => {
  let captured;
  const request = (url, options, callback) => {
    const upstream = new PassThrough(), chunks = []; upstream.setTimeout = () => upstream;
    upstream.on('data', chunk => chunks.push(Buffer.from(chunk)));
    upstream.on('finish', () => {
      captured = { url: url.href, ...options, body: Buffer.concat(chunks).toString() };
      const reply = Readable.from(['{"account":{"characters":[]}}']); Object.assign(reply, { statusCode: 200, headers: { 'content-type':'application/json', 'cache-control':'public', connection:'keep-alive' } }); callback(reply);
    });
    return upstream;
  };
  const f = await fixture(t, request), body = '{"requestId":"qa-audio-fixture","name":"QA"}';
  const result = await invoke(f.handler, '/api/stone/account?existing=1&url=https://other.example', { method:'POST', body, headers:{ authorization:'Bearer isolated-test-token', 'content-type':'application/json', connection:'keep-alive, x-remove', 'x-remove':'private-hop' } });
  assert.equal(result.status, 200); assert.deepEqual(JSON.parse(result.body), { account:{characters:[]} });
  assert.equal(captured.url, PREVIEW_BACKEND + '/api/stone/account?existing=1&url=https://other.example'); assert.equal(captured.method,'POST'); assert.equal(captured.body,body);
  assert.equal(captured.headers.authorization,'Bearer isolated-test-token'); assert.equal(captured.headers.host,new URL(PREVIEW_BACKEND).host); assert.equal(captured.headers['x-remove'],undefined);
  assert.equal(result.headers['cache-control'],'no-store'); assert.equal(result.headers['cdn-cache-control'],'no-store'); assert.equal(result.headers.connection,undefined);
});

test('backend failures return an uncached 502 without leaking request secrets', async t => {
  const f = await fixture(t, () => { const upstream = new PassThrough(); upstream.setTimeout = () => upstream; queueMicrotask(() => upstream.destroy(new Error('Secret upstream details'))); return upstream; });
  const result = await invoke(f.handler, '/api/stone/account', { headers:{authorization:'Bearer secret'} });
  assert.equal(result.status,502); assert.equal(result.headers['Cache-Control'],'no-store'); assert.equal(result.body.toString(),'Game backend unavailable');
});

test('frozen asset validation refuses changed bytes and wrong length', async t => {
  const f = await fixture(t), hash = createHash('sha256').update(f.bytes).digest('hex');
  await assert.rejects(verifyPreviewAsset(f.file, hash, 1), /size mismatch/);
  await writeFile(f.file, Buffer.from('different!!!'));
  await assert.rejects(verifyPreviewAsset(f.file, hash), /hash mismatch/);
});

test('the real Vercel checkout reuses exactly three registry-matching models and twelve materials', async () => {
  const assets = await loadPreviewAssets(); assert.equal(assets.size,15);
  assert.equal([...assets.keys()].filter(path => path.endsWith('.glb')).length,3);
  assert.equal([...assets.keys()].filter(path => path.endsWith('.jpg')).length,12);
  assert([...assets.values()].every(asset => asset.bytes > 0 && /^[a-f0-9]{64}$/.test(asset.sha256)));
});
