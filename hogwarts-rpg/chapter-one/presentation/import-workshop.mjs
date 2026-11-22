import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const SOURCE = JSON.parse(await readFile(new URL('./frozen-sources.json', import.meta.url), 'utf8'));
export const OUTPUT = fileURLToPath(new URL(`../../assets/chapter-one/workshop/${SOURCE.packageId}/`, import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export async function verifyWorkshop(directory = OUTPUT, expectedSource = SOURCE) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.commit !== expectedSource.commit || manifest.files.length !== expectedSource.files.length) throw new Error('WORKSHOP_MANIFEST_VERSION_MISMATCH');
  for (const expected of expectedSource.files) {
    const item = manifest.files.find(file => file.path === expected.path);
    if (!item || item.sha256 !== expected.sha256 || item.bytes !== expected.bytes) throw new Error(`WORKSHOP_MANIFEST_MISMATCH:${expected.path}`);
    const bytes = await readFile(path.join(directory, expected.path));
    if (bytes.length !== expected.bytes || sha(bytes) !== expected.sha256) throw new Error(`WORKSHOP_FILE_MISMATCH:${expected.path}`);
  }
  return { commit: expectedSource.commit, files: expectedSource.files.length, verified: true };
}

export async function importWorkshop(repository = SOURCE.defaultRepository, directory = OUTPUT) {
  const commit = execFileSync('git', ['-C', repository, 'rev-parse', `${SOURCE.commit}^{commit}`], { encoding: 'utf8' }).trim();
  if (commit !== SOURCE.commit) throw new Error('WORKSHOP_COMMIT_MISMATCH');
  // Validate every blob before writing any destination; never checkout or read WIP files.
  const blobs = SOURCE.files.map(file => {
    const bytes = execFileSync('git', ['-C', repository, 'show', `${SOURCE.commit}:${file.path}`], { maxBuffer: 80 * 1024 * 1024 });
    if (sha(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error(`WORKSHOP_SOURCE_MISMATCH:${file.path}`);
    return { file, bytes };
  });
  for (const { file, bytes } of blobs) {
    const destination = path.join(directory, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(`${destination}.importing`, bytes);
    await rename(`${destination}.importing`, destination);
  }
  // Deliberately reproducible: no wall-clock timestamp or current branch in this artifact.
  const manifest = { version: SOURCE.version, commit: SOURCE.commit, packageId: SOURCE.packageId, sourceThreadId: SOURCE.sourceThreadId, bytePreservation: 'exact git blobs', files: SOURCE.files };
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return verifyWorkshop(directory);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const verifyOnly = process.argv.includes('--verify');
  const sourceAt = process.argv.indexOf('--source');
  console.log(JSON.stringify(verifyOnly ? await verifyWorkshop() : await importWorkshop(sourceAt < 0 ? undefined : process.argv[sourceAt + 1])));
}
