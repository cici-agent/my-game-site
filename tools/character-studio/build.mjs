// In the game checkout, run npm install and npm run build from this directory.
// The shipped page contains its redistributable starter model. --sample can
// also supply the original pixiv VRM to regenerate the page from scratch.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const {values}=parseArgs({options:{sample:{type:'string'},modules:{type:'string',multiple:true},motions:{type:'string'},controller:{type:'string'}}});
const out=path.join(root,'character-studio','fit.html');
const motionDir=values.motions || path.join(root,'tools/blender/motion/standard-vrma');
const modules=[path.join(here,'node_modules'), ...(values.modules??[]).map(p=>path.resolve(p))];
const require=createRequire(import.meta.url);
const esbuild=require(require.resolve('esbuild',{paths:modules.map(p=>path.dirname(p))}));
let sample;
if(values.sample) sample=await fs.readFile(values.sample);
else {
  const current=await fs.readFile(out,'utf8');
  const element=current.match(/<script type="application\/json" id="assets">(.*?)<\/script>/s);
  if(!element)throw Error('Supply the original VRM with --sample <path>.');
  sample=Buffer.from(JSON.parse(element[1]).sample,'base64');
}
const meta=JSON.parse(sample.toString('utf8',20,20+sample.readUInt32LE(12))).extensions?.VRMC_vrm?.meta;
if(!meta?.allowRedistribution || meta.name!=='VRM1_Constraint_Twist_Sample' || !meta.authors.includes('pixiv Inc.')) {
  throw Error('Expected the redistributable pixiv VRM 1.0 sample.');
}
const assets={sample:sample.toString('base64')};
for(const name of ['Idle','Walk','Run','Cast']) assets[name]=(await fs.readFile(path.join(motionDir,name+'.vrma'))).toString('base64');
const plugins=values.controller?[{name:'game-motion',setup(build){
  build.onResolve({filter:/^\.\.\/\.\.\/js\/magic\/character-motion\.js$/},()=>({path:path.resolve(values.controller)}));
}}]:[];
const bundle=await esbuild.build({entryPoints:[path.join(here,'fit.mjs')],nodePaths:modules,plugins,format:'iife',platform:'browser',target:'es2020',minify:true,legalComments:'inline',write:false,bundle:true});
const licenses=[];
const pkgFile=require.resolve('@pixiv/three-vrm',{paths:modules.map(p=>path.dirname(p))});
const pixivDir=path.dirname(path.dirname(path.dirname(pkgFile)));
const packageRoot=path.dirname(pixivDir);
for(const name of ['three',...(await fs.readdir(pixivDir)).filter(n=>n.startsWith('three-vrm')).map(n=>'@pixiv/'+n)]) {
  licenses.push(name+'\n'+await fs.readFile(path.join(packageRoot,name,'LICENSE'),'utf8'));
}
licenses.push('Character animation attribution\nWalking and running were adapted from Carnegie Mellon University Graphics Lab Motion Capture Database, trials 02_01 and 02_03. The database was created with funding from NSF EIA-0196217. https://mocap.cs.cmu.edu/');
const safe=text=>text.replace(/<\/script/gi,'<\\/script');
const template=await fs.readFile(path.join(here,'template.html'),'utf8');
const result=template.replace('</body>',()=>'<script type="text/plain" id="licenses">'+safe(licenses.join('\n\n'))+'</script></body>')
  .replace('<!--ASSETS-->',()=>'<script type="application/json" id="assets">'+JSON.stringify(assets)+'</script>')
  .replace('<!--APP-->',()=>'<script>'+safe(bundle.outputFiles[0].text)+'</script>');
await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,result);
console.log('Built the four-clip VRM workbench.',out);
