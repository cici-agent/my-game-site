import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildVercel, createVercelConfig } from '../scripts/build-vercel.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const execFileAsync = promisify(execFile);
const materialManifest = JSON.parse(await readFile(join(root, 'assets/chapter-one/materials/manifest.json'), 'utf8'));
async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path)); else found.push(path);
  }
  return found;
}

test('Vercel export rebuilds from the exact source-copy manifest without any GLBs, source chunks or hosting bindings', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'stone-vercel-build-'));
  try {
    const first = await buildVercel({ outDir: join(scratch, 'first-public'), metadataDir: join(scratch, 'first-meta') });
    const isolated = join(scratch, 'hogwarts-rpg'), publicDir = join(scratch, 'public');
    for (const path of first.sourceManifest.requiredSourceFiles) {
      assert(!/\.glb$|\.part$|\.openai\//.test(path), `${path} must not be a build dependency`);
      await mkdir(dirname(join(isolated, path)), { recursive: true });
      await copyFile(join(root, path), join(isolated, path));
    }
    await symlink(join(root, 'node_modules'), join(isolated, 'node_modules'), 'dir');
    await mkdir(publicDir, { recursive: true });
    await writeFile(join(publicDir, 'index.html'), 'existing universe remains');
    await execFileAsync(process.execPath, [join(isolated, 'scripts/build-vercel.mjs'), '--out-dir', publicDir, '--metadata-dir', join(scratch, 'second-meta')], { cwd: scratch });
    assert.equal(await readFile(join(publicDir, 'index.html'), 'utf8'), 'existing universe remains');
    const second = JSON.parse(await readFile(join(scratch, 'second-meta/vercel-source-manifest.json'), 'utf8'));
    assert.deepEqual(second.requiredSourceFiles, first.sourceManifest.requiredSourceFiles);
    assert.equal(second.staticFiles.length, first.sourceManifest.staticFiles.length);
    assert(second.requiredSourceFiles.includes('assets/chapter-one/workshop/65154a9106f3/js/magic/character-motion.js'));
    assert(second.requiredSourceFiles.includes('assets/chapter-one/workshop/65154a9106f3/js/magic/wand-gesture.js'));
    const html = await readFile(join(publicDir, 'stone.html'), 'utf8');
    for (const [, path] of html.matchAll(/(?:src|href)="(\/(?:css\/[^"?]+\.css|stone-play\.mjs))"/g)) assert((await readFile(join(publicDir, path.slice(1)))).byteLength > 0);
    assert((await readFile(join(publicDir, 'stone-play.mjs'))).byteLength > 100000);
    assert((await readFile(join(publicDir, 'assets/chapter-one/materials/manifest.json'))).byteLength > 0);
    assert(!(await walk(publicDir)).some(path => /\.glb$|\.part$|server\/index\.js|hosting\.json/.test(path)));
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

test('suggested Vercel routes are confined to authoritative RPG API and exact frozen assets', () => {
  const config = createVercelConfig({ manifest: materialManifest, backend: 'https://runtime.example.test' });
  const models = config.rewrites.filter(route => route.source.endsWith('.glb'));
  const textures = config.rewrites.filter(route => route.source.endsWith('.jpg'));
  assert.equal(models.length, 3);
  assert.equal(textures.length, Object.values(materialManifest.materials).flatMap(material => Object.values(material.maps)).length);
  assert(config.rewrites.some(route => route.source === '/api/stone/:path*' && route.destination === 'https://runtime.example.test/api/stone/:path*'));
  assert(config.rewrites.every(route => route.source.startsWith('/api/stone/') || route.source.startsWith('/assets/chapter-one/')));
  assert(!config.rewrites.some(route => route.source.endsWith('manifest.json') || route.source === '/'));
  const apiHeaders = config.headers.find(route => route.source === '/api/stone/:path*').headers;
  assert(apiHeaders.some(header => header.key === 'Cache-Control' && header.value === 'no-store'));
  assert(apiHeaders.some(header => header.key === 'x-vercel-enable-rewrite-caching' && header.value === '0'));
  assert.throws(() => createVercelConfig({ manifest: materialManifest, backend: 'http://runtime.example.test' }), /HTTPS origin/);
  assert.throws(() => createVercelConfig({ manifest: materialManifest, backend: 'https://user:credential@runtime.example.test' }), /HTTPS origin/);
});
