import { handleParty } from './worker-api.mjs';
import { handleWorkshopModel } from './chapter-one/server/model-assets.mjs';
import { handleChapterOne } from './chapter-one/online/api.mjs';
import files from 'game:files';
import materialManifest from './assets/chapter-one/materials/manifest.json' with {type:'json'};

const environmentMaps = new Map(Object.values(materialManifest.materials).flatMap(m => Object.values(m.maps).map(map => [map.url,map])));

const types = {html:'text/html; charset=utf-8', mjs:'text/javascript; charset=utf-8', css:'text/css; charset=utf-8', webp:'image/webp',json:'application/json; charset=utf-8'};
export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/stone/')) return handleChapterOne(request,env);
    if (pathname.startsWith('/api/')) return handleParty(request, env);
    if (!['GET','HEAD'].includes(request.method)) return new Response(null, {status:405,headers:{Allow:'GET, HEAD'}});
    if(environmentMaps.has(pathname)) {
      const map=environmentMaps.get(pathname);
      const upstream=await fetch(map.upstream,{method:request.method,cf:{cacheEverything:true,cacheTtl:604800}});
      if(!upstream.ok)return new Response('场景材质暂时不可用。',{status:502});
      return new Response(upstream.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=604800','ETag':'"'+map.sha256+'"','X-Content-Type-Options':'nosniff'}});
    }
    const modelResponse=await handleWorkshopModel(request,env);
    if(modelResponse)return modelResponse;
    const file = pathname === '/' ? '/stone.html' : pathname;
    if (!Object.hasOwn(files,file)) return new Response('找不到这一页。', {status:404});
    const ext = file.split('.').pop();
    let body = files[file];
    if (request.method === 'HEAD') body = null;
    else if (ext === 'webp') body = Uint8Array.from(atob(body), c => c.charCodeAt(0));
    return new Response(body,{headers:{'Content-Type':types[ext],'Cache-Control':ext === 'webp' ? 'public, max-age=3600' : 'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
  }
};
