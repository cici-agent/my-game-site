// Local Vercel-shaped preview. Frozen assets are read only; no database or build.
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHARACTER_ASSETS, WORKSHOP_COMMIT } from '../chapter-one/presentation/registry.mjs';

export const PREVIEW_BACKEND = 'https://hogwarts-adventure-journal.mingyang83400.chatgpt.site';
export const PREVIEW_SITE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.avif':'image/avif', '.ico':'image/x-icon', '.glb':'model/gltf-binary', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.wav':'audio/wav', '.mp4':'video/mp4', '.webm':'video/webm', '.wasm':'application/wasm' };
const hopHeaders = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
const inside = (root, path) => { const local = relative(root, path); return local === '' || local !== '..' && !local.startsWith(`..${sep}`) && !local.startsWith(sep); };

export async function verifyPreviewAsset(file, sha256, expectedBytes) {
  const actual = await realpath(file), info = await stat(actual);
  if (!info.isFile() || expectedBytes !== undefined && info.size !== expectedBytes) throw new Error(`Frozen asset size mismatch: ${file}`);
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(actual)) hash.update(bytes);
  if (hash.digest('hex') !== sha256) throw new Error(`Frozen asset hash mismatch: ${file}`);
  return Object.freeze({ file: actual, bytes: info.size, sha256 });
}

export async function loadPreviewAssets(siteRoot = PREVIEW_SITE_ROOT) {
  const assets = new Map(), prefix = `/assets/chapter-one/workshop/${WORKSHOP_COMMIT.slice(0,12)}/assets/3d/magic/characters/`;
  for (const model of Object.values(CHARACTER_ASSETS)) assets.set(prefix + model.filename, await verifyPreviewAsset(join(siteRoot, 'assets/3d/magic/characters', model.filename), model.sha256));
  const sourceRoot = join(siteRoot, 'hogwarts-rpg'), manifest = JSON.parse(await readFile(join(sourceRoot, 'assets/chapter-one/materials/manifest.json'), 'utf8'));
  const maps = Object.values(manifest.materials).flatMap(material => Object.values(material.maps));
  if (maps.length !== 12) throw new Error('Preview expects the twelve frozen material maps.');
  for (const map of maps) {
    if (!/^\/assets\/chapter-one\/materials\/(brick|stone|wood|floor)-(albedo|normal|roughness)\.jpg$/.test(map.url) || assets.has(map.url)) throw new Error('Unexpected frozen material URL.');
    assets.set(map.url, await verifyPreviewAsset(join(sourceRoot, map.url.slice(1)), map.sha256, map.bytes));
  }
  return assets;
}

function headersWithoutHop(headers) {
  const remove = new Set([...hopHeaders, ...String(headers.connection ?? '').toLowerCase().split(',').map(v => v.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([key, value]) => value !== undefined && !remove.has(key.toLowerCase())));
}
function fail(res, status, message) { if (res.headersSent) return res.destroy(); res.writeHead(status, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}); res.end(message); }
function pathFromRequest(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) throw new Error('Invalid request path');
  const path = decodeURIComponent(value.split('?')[0]);
  if (/[\\\0]/.test(path) || path.split('/').some(segment => segment === '..' || segment === '.')) throw new Error('Invalid request path');
  return path;
}

/** assetMap is a map returned by loadPreviewAssets; dependency injection keeps tests offline. */
export async function createPreviewHandler({ siteRoot = PREVIEW_SITE_ROOT, assetMap, backendRequest = httpsRequest } = {}) {
  const root = await realpath(siteRoot), assets = assetMap ?? await loadPreviewAssets(root);
  return async function preview(req, res) {
    try {
      let path; try { path = pathFromRequest(req.url); } catch { return fail(res, 400, 'Invalid request path'); }
      if (path.startsWith('/api/stone/')) {
        const headers = headersWithoutHop(req.headers); headers.host = new URL(PREVIEW_BACKEND).host;
        // This is the only outbound route. No supplied URL, Host, redirect or
        // query parameter can select another backend; auth/body stay unchanged.
        const upstream = backendRequest(new URL(req.url, PREVIEW_BACKEND), { method: req.method, headers }, reply => {
          const responseHeaders = headersWithoutHop(reply.headers); responseHeaders['cache-control'] = 'no-store'; responseHeaders['cdn-cache-control'] = 'no-store';
          res.writeHead(reply.statusCode ?? 502, responseHeaders); reply.on('error', () => res.destroy()); reply.pipe(res);
        });
        upstream.setTimeout(15000, () => upstream.destroy(new Error('Backend timeout')));
        upstream.on('error', () => fail(res, 502, 'Game backend unavailable'));
        req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return;
      }
      if (!['GET','HEAD'].includes(req.method)) return fail(res, 405, 'Static resources accept GET and HEAD only');
      if (path === '/') path = '/index.html';
      // Never expose worktree metadata, dependency trees or the source mirror.
      if (path.split('/').some(part => part.startsWith('.') || ['hogwarts-rpg','node_modules','scripts','tests','tools'].includes(part))) return fail(res, 404, 'Not found');
      const mapped = assets.get(path), mime = types[extname(path).toLowerCase()];
      if (!mime) return fail(res, 404, 'Not found');
      // Unknown workshop versions are not substituted with whichever model is handy.
      if (path.startsWith('/assets/chapter-one/workshop/') && !mapped) return fail(res, 404, 'Not found');
      let file;
      try { file = mapped?.file ?? await realpath(resolve(root, path.slice(1))); } catch { return fail(res, 404, 'Not found'); }
      if (!mapped && !inside(root, file)) return fail(res, 404, 'Not found');
      const info = await stat(file); if (!info.isFile()) return fail(res, 404, 'Not found');
      res.writeHead(200, {'Content-Type':mime,'Content-Length':info.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res);
    } catch { fail(res, 500, 'Preview request failed'); }
  };
}

export async function startPreview({ siteRoot = PREVIEW_SITE_ROOT, port = 4192 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid preview port');
  const server = createServer(await createPreviewHandler({ siteRoot }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]))) throw new Error('Usage: node hogwarts-rpg/scripts/preview-vercel.mjs [--port 4192]');
    const server = await startPreview({ port: args.length ? Number(args[1]) : 4192 });
    console.log(`Hogwarts preview http://127.0.0.1:${server.address().port}/stone.html`);
    console.log('3 frozen models and 12 material maps verified; only /api/stone/* uses the existing game backend.');
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
