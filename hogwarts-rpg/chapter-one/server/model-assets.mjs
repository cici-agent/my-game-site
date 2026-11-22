// Frozen workshop package 65154a9106f3. A filename never selects a mutable model:
// bytes must pass R2's SHA-256 integrity check before any response is returned.
// R2 put/known-length/checksum contract:
// https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
// https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/
export const MODEL_PREFIX='/assets/chapter-one/workshop/65154a9106f3/assets/3d/magic/characters/';
const UPSTREAM='https://my-game-site-delta.vercel.app/assets/3d/magic/characters/';
const MIME='model/gltf-binary';
const CACHE='public, max-age=31536000, immutable';
const keyFor=sha=>`workshop/sha256/${sha}.glb`;
export const WORKSHOP_MODELS=Object.freeze([
 {name:'harry-pathfinder.glb',sha256:'df19f8637d16c1735e5e1689915057b88fcf38fb993f4192ebb01757c91ec241',bytes:33339532},
 {name:'hermione-scholar.glb',sha256:'691534dcd8311af0ac9673cb6dcec15d305f8fe8b6c5f2ddbaa09062ae274020',bytes:40670484},
 {name:'ron-weasley.glb',sha256:'3b1da7d34014c3799d2dc4696bf716d5f81151b377e1ade5a0328739f9bbcac4',bytes:31098576},
].map(d=>Object.freeze({...d,key:keyFor(d.sha256)})));

class ModelError extends Error{constructor(code,status=502){super(code);this.code=code;this.status=status;}}
const hashBytes=hex=>Uint8Array.from(hex.match(/../g),part=>Number.parseInt(part,16)).buffer;
function hashHex(value){
 if(!value)return null;
 const bytes=ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):value instanceof ArrayBuffer?new Uint8Array(value):null;
 return bytes?Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join(''):null;
}
async function discard(object){try{await object?.body?.cancel();}catch{/* Already consumed/cancelled by R2. */}}
function verified(object,descriptor){return object?.size===descriptor.bytes&&hashHex(object?.checksums?.sha256)===descriptor.sha256;}
async function getVerified(bucket,descriptor){
 const object=await bucket.get(descriptor.key);
 if(object&&!verified(object,descriptor)){await discard(object);throw new ModelError('MODEL_INTEGRITY_FAILED');}
 return object;
}

// Injection is for deterministic stream/R2 tests, not an HTTP configuration API.
// Download URLs and object keys are always derived from validated descriptors.
export function createWorkshopModelHandler({descriptors=WORKSHOP_MODELS,fetchImpl=(...args)=>fetch(...args),createFixedLengthStream=length=>new FixedLengthStream(length)}={}){
 const models=new Map();
 for(const input of descriptors){
  if(!/^[a-z0-9-]+\.glb$/.test(input.name)||!/^[a-f0-9]{64}$/.test(input.sha256)||!Number.isSafeInteger(input.bytes)||input.bytes<=0||models.has(input.name))throw new TypeError('Invalid frozen model descriptor');
  models.set(input.name,Object.freeze({name:input.name,sha256:input.sha256,bytes:input.bytes,key:keyFor(input.sha256)}));
 }
 // A bucket-scoped single flight coalesces same-isolate cold requests. Across
 // isolates, a conditional put is write-once; both candidates must pass the
 // same checksum. This is not a claim of a global distributed download lock.
 const flights=new WeakMap();
 async function ingest(bucket,descriptor){
  // Workers supports manual/follow redirects. Manual plus the strict 200 check
  // rejects redirects without following a mutable or unapproved destination.
  const upstream=await fetchImpl(`${UPSTREAM}${descriptor.name}?version=${descriptor.sha256}`,{method:'GET',redirect:'manual',headers:{'Accept-Encoding':'identity'}});
  if(upstream.status!==200||!upstream.body){await discard(upstream);throw new ModelError('MODEL_UPSTREAM_UNAVAILABLE');}
  const length=upstream.headers.get('Content-Length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==descriptor.bytes)){await discard(upstream);throw new ModelError('MODEL_LENGTH_MISMATCH');}
  let fixed;
  try{fixed=createFixedLengthStream(descriptor.bytes);}catch(error){await discard(upstream);throw error;}
  const abort=new AbortController();
  // Never arrayBuffer()/tee() the 31–41 MB asset: backpressure runs directly
  // from the upstream response through the bounded fixed-length stream to R2.
  const piping=upstream.body.pipeTo(fixed.writable,{signal:abort.signal});
  const saving=Promise.resolve().then(()=>bucket.put(descriptor.key,fixed.readable,{
   sha256:hashBytes(descriptor.sha256),onlyIf:{etagDoesNotMatch:'*'},
   httpMetadata:{contentType:MIME,cacheControl:CACHE},
   customMetadata:{packageId:'65154a9106f3',sourceName:descriptor.name,sha256:descriptor.sha256},
  })).then(async object=>{if(!object){abort.abort();await fixed.readable.cancel().catch(()=>{});}return object;},async error=>{abort.abort(error);await fixed.readable.cancel(error).catch(()=>{});throw error;});
  const [pipeResult,putResult]=await Promise.allSettled([piping,saving]);
  if(putResult.status==='rejected')throw new ModelError('MODEL_INTEGRITY_OR_STORAGE_FAILED');
  // A different isolate won the conditional write. Re-read and validate its
  // checksum rather than returning the cancelled upstream body.
  if(putResult.value===null){const winner=await getVerified(bucket,descriptor);if(!winner)throw new ModelError('MODEL_STORAGE_UNAVAILABLE',503);await discard(winner);return;}
  if(pipeResult.status==='rejected'||!verified(putResult.value,descriptor))throw new ModelError('MODEL_INTEGRITY_FAILED');
 }
 async function ensureStored(bucket,descriptor){
  let pending=flights.get(bucket);if(!pending){pending=new Map();flights.set(bucket,pending);}
  let task=pending.get(descriptor.key);
  if(!task){task=ingest(bucket,descriptor).finally(()=>{if(pending.get(descriptor.key)===task)pending.delete(descriptor.key);});pending.set(descriptor.key,task);}
  await task;
 }
 return async function handleWorkshopModel(request,env){
  const pathname=new URL(request.url).pathname;
  if(!pathname.startsWith(MODEL_PREFIX))return null;
  const descriptor=models.get(pathname.slice(MODEL_PREFIX.length));
  if(!descriptor)return new Response('模型不存在。',{status:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const bucket=env?.WORKSHOP_ASSETS;
  if(!bucket?.get||!bucket?.put)return Response.json({code:'MODEL_STORAGE_UNAVAILABLE',error:'人物资源存储暂时不可用。'},{status:503,headers:{'Cache-Control':'no-store'}});
  let stage='r2-get';
  try{
   let object=await getVerified(bucket,descriptor);
   if(!object){stage='download-and-store';await ensureStored(bucket,descriptor);stage='r2-read-stored';object=await getVerified(bucket,descriptor);}
   if(!object?.body){await discard(object);throw new ModelError('MODEL_STORAGE_UNAVAILABLE',503);}
   stage='response';
   const etag=`"${descriptor.sha256}"`;
   const headers={'Content-Type':MIME,'Cache-Control':CACHE,'ETag':etag,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Workshop-SHA256':descriptor.sha256};
   const match=request.headers.get('If-None-Match')?.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag);
   if(match){await discard(object);return new Response(null,{status:304,headers});}
   headers['Content-Length']=String(descriptor.bytes);
   if(request.method==='HEAD'){await discard(object);return new Response(null,{headers});}
   return new Response(object.body,{headers});
  }catch(error){
   console.error('Workshop model unavailable',descriptor.name,stage,error?.name,String(error?.message??'unknown').slice(0,500),'FixedLengthStream:',typeof FixedLengthStream);
   return Response.json({code:error instanceof ModelError?error.code:'MODEL_ASSET_UNAVAILABLE',error:'人物资源校验或存储暂时不可用，请稍后重试。'},{status:error instanceof ModelError?error.status:502,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
 };
}
export const handleWorkshopModel=createWorkshopModelHandler();
