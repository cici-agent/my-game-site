// Local review entry only. Intentionally absent from scripts/build.mjs and Worker routes.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
export async function buildVisualReview() {
  const result = await build({ entryPoints: [fileURLToPath(new URL('./visual-review.mjs', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
  return result.outputFiles[0].contents;
}
export const visualReviewHtmlPath = fileURLToPath(new URL('./visual-review.html', import.meta.url));
