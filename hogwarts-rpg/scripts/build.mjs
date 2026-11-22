import { mkdir, readFile, readdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { restoreWorkshopAssets } from './workshop-assets.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
await restoreWorkshopAssets();
const client = await build({entryPoints:['js/magic/entry.mjs'],bundle:true,write:false,minify:true,format:'esm',platform:'browser',target:'es2022',legalComments:'inline'});
const lab = await build({entryPoints:['js/magic/lab-app.mjs'],bundle:true,write:false,minify:true,format:'esm',platform:'browser',target:'es2022',legalComments:'inline'});
const stone = await build({entryPoints:['chapter-one/client/app.mjs'],bundle:true,write:false,minify:true,format:'esm',platform:'browser',target:'es2022',legalComments:'inline'});
const files = {'/rpg.html':await readFile('rpg.html','utf8'), '/play.mjs':client.outputFiles[0].text, '/lab.html':await readFile('lab.html','utf8'), '/lab.mjs':lab.outputFiles[0].text};
files['/stone.html']=await readFile('stone.html','utf8');
files['/stone-play.mjs']=stone.outputFiles[0].text;
files['/assets/chapter-one/materials/manifest.json']=await readFile('assets/chapter-one/materials/manifest.json','utf8');
files['/wardrobe.html'] = await readFile('wardrobe.html','utf8');
for (const directory of ['assets/rpg','css']) {
  for (const file of await readdir(directory)) {
    if (!/\.(webp|css)$/.test(file)) continue;
    const path = directory + '/' + file;
    files['/' + path] = await readFile(path,file.endsWith('.webp') ? 'base64' : 'utf8');
  }
}
await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',plugins:[{
  name:'game-files', setup(api) {
    api.onResolve({filter:/^game:files$/}, () => ({path:'files',namespace:'game'}));
    api.onLoad({filter:/^files$/,namespace:'game'}, () => ({contents:JSON.stringify(files),loader:'json'}));
  }
}]});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
