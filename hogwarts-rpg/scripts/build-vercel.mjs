import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { CHARACTER_ASSETS, WORKSHOP_COMMIT } from '../chapter-one/presentation/registry.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_BACKEND_ORIGIN = 'https://hogwarts-adventure-journal.mingyang83400.chatgpt.site';
const materialManifestPath = 'assets/chapter-one/materials/manifest.json';
const modelPrefix = `/assets/chapter-one/workshop/${WORKSHOP_COMMIT.slice(0, 12)}/assets/3d/magic/characters/`;
const slash = path => path.split(sep).join('/');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function backendOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Backend must be an HTTPS origin without credentials, a path, query or fragment.');
  return url.origin;
}

function runtimeAssets(manifest) {
  const textures = Object.values(manifest.materials).flatMap(material => Object.values(material.maps));
  for (const texture of textures) {
    if (!/^\/assets\/chapter-one\/materials\/[a-z0-9-]+\.jpg$/.test(texture.url)) throw new Error(`Unexpected material path: ${texture.url}`);
  }
  const models = Object.values(CHARACTER_ASSETS).map(({ filename, sha256 }) => ({ path: `${modelPrefix}${filename}`, sha256 }));
  return { models, textures: textures.map(({ url, sha256, bytes }) => ({ path: url, sha256, bytes })) };
}

/** Merge these narrow routes into the existing site's config; never replace its root route. */
export function createVercelConfig({ manifest, backend = DEFAULT_BACKEND_ORIGIN }) {
  const origin = backendOrigin(backend), assets = runtimeAssets(manifest);
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    rewrites: [
      { source: '/api/stone/:path*', destination: `${origin}/api/stone/:path*` },
      ...[...assets.models, ...assets.textures].map(asset => ({ source: asset.path, destination: `${origin}${asset.path}` })),
    ],
    headers: [
      { source: '/api/stone/:path*', headers: [
        { key: 'Cache-Control', value: 'no-store' },
        { key: 'CDN-Cache-Control', value: 'no-store' },
        { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        { key: 'x-vercel-enable-rewrite-caching', value: '0' },
      ] },
      ...['/stone.html', '/stone-play.mjs'].map(source => ({ source, headers: [{ key: 'Cache-Control', value: 'no-cache' }] })),
    ],
  };
}

async function filesUnder(directory) {
  const paths = [];
  for (const entry of await readdir(join(projectRoot, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await filesUnder(path));
    else if (entry.isFile()) paths.push(path);
    else throw new Error(`Static export does not follow symbolic links: ${path}`);
  }
  return paths.sort();
}

/** Static-only export. No GLB restoration, download, database access or Worker mutation. */
export async function buildVercel({ outDir = join(projectRoot, 'dist/vercel'), metadataDir = join(projectRoot, 'dist'), backend = DEFAULT_BACKEND_ORIGIN } = {}) {
  const destination = resolve(outDir), metadata = resolve(metadataDir), origin = backendOrigin(backend);
  const html = await readFile(join(projectRoot, 'stone.html'), 'utf8');
  const stylesheetPaths = [...html.matchAll(/<link\b[^>]*\bhref="(\/css\/[a-z0-9-]+\.css)"/gi)].map(match => match[1].slice(1));
  if (!stylesheetPaths.length || !html.includes('src="/stone-play.mjs"')) throw new Error('The stone entry must reference its exported bundle and stylesheets.');
  const imagePaths = (await filesUnder('assets/rpg')).filter(path => /\.(?:webp|png|jpe?g|svg|avif)$/i.test(path));
  const copyPaths = [...new Set(['stone.html', ...stylesheetPaths, ...imagePaths, materialManifestPath])].sort();
  const materialManifest = JSON.parse(await readFile(join(projectRoot, materialManifestPath), 'utf8'));
  const result = await build({
    absWorkingDir: projectRoot,
    entryPoints: ['chapter-one/client/app.mjs'],
    bundle: true, write: false, metafile: true, minify: true,
    format: 'esm', platform: 'browser', target: 'es2022', legalComments: 'inline',
  });
  if (result.outputFiles.length !== 1) throw new Error('Expected one self-contained stone browser bundle.');
  const outputs = await Promise.all(copyPaths.map(async path => ({ path, bytes: await readFile(join(projectRoot, path)) })));
  outputs.push({ path: 'stone-play.mjs', bytes: result.outputFiles[0].contents });
  // An existing universe/park export can share this directory. Only the explicit
  // RPG files above are written, and the directory is never cleared.
  for (const file of outputs) {
    const output = join(destination, file.path);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, file.bytes);
  }
  const dependencies = Object.keys(result.metafile.inputs).map(path => slash(isAbsolute(path) ? relative(projectRoot, path) : path));
  const sources = dependencies.filter(path => !/(?:^|\/)node_modules\//.test(path));
  if (sources.some(path => path.startsWith('../') || /\.glb$|(?:^|\/)\.parts\//i.test(path))) throw new Error('Static build unexpectedly depends on a GLB, source chunk or file outside the RPG source tree.');
  const assets = runtimeAssets(materialManifest), config = createVercelConfig({ manifest: materialManifest, backend: origin });
  const sourceManifest = {
    version: 1,
    destinationSubdirectory: 'hogwarts-rpg',
    entry: '/stone.html',
    noModelRestorationRequired: true,
    installCommand: 'npm --prefix hogwarts-rpg ci --ignore-scripts',
    buildCommandExample: 'node hogwarts-rpg/scripts/build-vercel.mjs --out-dir <existing-site-static-output>',
    requiredSourceFiles: [...new Set([...sources, ...copyPaths, 'package.json', 'package-lock.json', 'scripts/build-vercel.mjs'])].sort(),
    fullSourceCopyExclusions: ['.git/**', '.openai/**', '.vercel/**', 'node_modules/**', '.local/**', 'dist/**', '**/*.glb', '**/.parts/**', '**/*.parts/**', '**/*.part', '**/*.part-*', '**/*.part.*', '**/.DS_Store', '**/.env', '**/.env.*'],
    sourceCopyNotes: [
      'Keep the frozen workshop js/magic sources in assets/chapter-one/workshop; they are imported motion code, not downloaded GLBs.',
      'RequiredSourceFiles is the minimum static build set. Full RPG source, tests and migrations may be retained separately under hogwarts-rpg using the exclusions.',
      'This exporter never clears output. Keep the universe, park, character studio and other existing website files.',
      'The suggested Vercel config contains only RPG rewrites and response headers; merge it with the target project configuration.',
    ],
    staticFiles: outputs.map(file => ({ path: `/${file.path}`, bytes: file.bytes.byteLength, sha256: hash(file.bytes) })).sort((a, b) => a.path.localeCompare(b.path)),
    backend: { origin, apiPath: '/api/stone/:path*', auth: 'Forward Authorization and request bodies unchanged; responses must never be CDN-cached.', models: assets.models, textures: assets.textures },
  };
  await mkdir(metadata, { recursive: true });
  await writeFile(join(metadata, 'vercel-source-manifest.json'), `${JSON.stringify(sourceManifest, null, 2)}\n`);
  await writeFile(join(metadata, 'vercel.config.suggested.json'), `${JSON.stringify(config, null, 2)}\n`);
  return { outDir: destination, metadataDir: metadata, sourceManifest, config };
}

function parseArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = { '--out-dir': 'outDir', '--metadata-dir': 'metadataDir', '--backend-origin': 'backend' }[args[i]];
    if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: node scripts/build-vercel.mjs [--out-dir PATH] [--metadata-dir PATH] [--backend-origin HTTPS_ORIGIN]');
    options[key] = args[++i];
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === await realpath(process.argv[1]).catch(() => '')) {
  const result = await buildVercel(parseArguments(process.argv.slice(2)));
  console.log(`Exported ${result.sourceManifest.staticFiles.length} static files to ${result.outDir}`);
  console.log(`Source-copy manifest and narrow Vercel config: ${result.metadataDir}`);
  console.log(`Runtime proxies: /api/stone/*, ${result.sourceManifest.backend.models.length} frozen models, ${result.sourceManifest.backend.textures.length} material maps.`);
}
