import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MODEL_PREFIX,WORKSHOP_MODELS,createWorkshopModelHandler,handleWorkshopModel} from '../chapter-one/server/model-assets.mjs';

const payload=new TextEncoder().encode('frozen GLB bytes');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const descriptor={name:'harry-pathfinder.glb',sha256:sha(payload),bytes:payload.byteLength};
const key=`workshop/sha256/${descriptor.sha256}.glb`;
const bytesOf=hex=>Uint8Array.from(Buffer.from(hex,'hex')).buffer;
const request=(options={},name=descriptor.name)=>new Request('https://game.test'+MODEL_PREFIX+name,options);
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function source(bytes=payload,{length=String(bytes.byteLength),gate}={}){
 let offset=0;
 const stream=new ReadableStream({async pull(controller){if(gate)await gate.promise;if(offset>=bytes.length){controller.close();return;}controller.enqueue(bytes.slice(offset,offset+3));offset+=3;}});
 const response=new Response(stream,{headers:length===null?{}:{'Content-Length':length}});
 response.arrayBuffer=()=>{throw Error('Production must not buffer the upstream');};response.clone=()=>{throw Error('Production must not tee the upstream');};return response;
}
function bucketMock(){
 const records=new Map(),calls={get:0,put:0,cancel:0},puts=[];
 const metadata=(record)=>({size:record.bytes.length,checksums:{sha256:bytesOf(record.checksum)},customMetadata:record.customMetadata??{}});
 return{records,calls,puts,
  async get(name){calls.get++;const record=records.get(name);if(!record)return null;return{...metadata(record),body:new ReadableStream({start(controller){controller.enqueue(record.bytes.slice());controller.close();},cancel(){calls.cancel++;}})};},
  async put(name,body,options){
   calls.put++;puts.push({name,body,options});assert(body instanceof ReadableStream);assert(options.sha256 instanceof ArrayBuffer);assert.deepEqual(options.onlyIf,{etagDoesNotMatch:'*'});
   if(records.has(name))return null;
   const chunks=[];for await(const chunk of body)chunks.push(chunk);const bytes=Buffer.concat(chunks),hash=sha(bytes);
   if(Buffer.from(options.sha256).toString('hex')!==hash)throw Error('R2 SHA256 integrity mismatch');
   if(records.has(name))return null;
   const record={bytes,checksum:hash,customMetadata:options.customMetadata};records.set(name,record);return metadata(record);
  },
 };
}
function fixedFactory(lengths){return length=>{lengths.push(length);let bytes=0;return new TransformStream({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>length)throw Error('FixedLengthStream overflow');controller.enqueue(chunk);},flush(){if(bytes!==length)throw Error('FixedLengthStream underflow');}});};}
function setup(options={}){
 const bucket=options.bucket??bucketMock(),fetches=[],lengths=[];
 const handler=createWorkshopModelHandler({descriptors:[descriptor],createFixedLengthStream:fixedFactory(lengths),fetchImpl:async(url,init)=>{fetches.push({url,init});return options.fetchImpl?options.fetchImpl(url,init):source();}});
 return{bucket,fetches,lengths,handler,env:{WORKSHOP_ASSETS:bucket}};
}

test('three production models exactly match the protected workshop manifest',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../assets/chapter-one/workshop/65154a9106f3/manifest.json',import.meta.url),'utf8'));
 const expected=manifest.files.filter(f=>f.path.endsWith('.glb')).map(f=>({name:f.path.split('/').at(-1),sha256:f.sha256,bytes:f.bytes}));
 assert.deepEqual(WORKSHOP_MODELS.map(({name,sha256,bytes})=>({name,sha256,bytes})),expected);
 assert.equal(WORKSHOP_MODELS.length,3);assert(WORKSHOP_MODELS.every(d=>d.key===`workshop/sha256/${d.sha256}.glb`));
});

test('routing exposes no arbitrary URL, object key or upload endpoint',async()=>{
 const h=setup();assert.equal(await h.handler(new Request('https://game.test/elsewhere'),h.env),null);
 assert.equal((await h.handler(request({},'not-allowed.glb'),h.env)).status,404);
 assert.equal((await h.handler(request({method:'POST'}),h.env)).status,405);
 assert.equal(h.fetches.length,0);assert.equal(h.bucket.calls.put,0);
 assert.equal((await handleWorkshopModel(request(),{})).status,503);
 const output=await h.handler(new Request('https://game.test'+MODEL_PREFIX+descriptor.name+'?url=https://attacker.test/other&sha=changed'),h.env);assert.equal(output.status,200);
 assert.equal(h.fetches[0].url,`https://my-game-site-delta.vercel.app/assets/3d/magic/characters/${descriptor.name}?version=${descriptor.sha256}`);
 assert.equal(h.fetches[0].init.redirect,'manual');await output.body.cancel();
});

test('edge-compatible manual redirects reject a changed upstream destination before storage',async()=>{
 const h=setup({fetchImpl:async(_url,init)=>{
  if(!['follow','manual'].includes(init.redirect))throw new TypeError('Unsupported edge redirect mode');
  assert.equal(init.redirect,'manual');
  return new Response(null,{status:307,headers:{Location:'https://unapproved.test/model.glb'}});
 }});
 const response=await h.handler(request(),h.env);
 assert.equal(response.status,502);assert.equal((await response.json()).code,'MODEL_UPSTREAM_UNAVAILABLE');
 assert.equal(h.fetches.length,1);assert.equal(h.bucket.calls.put,0);
});

test('cold GET streams into checksum-validated R2 before returning stored bytes',async()=>{
 const h=setup(),response=await h.handler(request(),h.env);
 assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),payload);
 assert.deepEqual(h.lengths,[payload.length]);assert.equal(h.bucket.calls.put,1);assert.equal(h.bucket.puts[0].name,key);assert.equal(h.bucket.calls.get,2);
 assert.equal(response.headers.get('Content-Length'),String(payload.length));assert.equal(response.headers.get('ETag'),`"${descriptor.sha256}"`);assert.equal(response.headers.get('X-Workshop-SHA256'),descriptor.sha256);
 assert.match(response.headers.get('Cache-Control'),/immutable/);
 const cached=await h.handler(request(),h.env);assert.deepEqual(new Uint8Array(await cached.arrayBuffer()),payload);assert.equal(h.fetches.length,1);assert.equal(h.bucket.calls.put,1);
});

test('the response is withheld until the streaming integrity check completes',async()=>{
 const gate=defer(),h=setup({fetchImpl:()=>source(payload,{gate})});let done=false;
 const pending=h.handler(request(),h.env).then(response=>{done=true;return response;});
 for(let i=0;i<12;i++)await Promise.resolve();assert.equal(done,false);assert.equal(h.bucket.records.size,0);
 gate.resolve();const response=await pending;assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),payload);
});

test('changed upstream bytes fail closed and never become a successful response or stored object',async()=>{
 const altered=payload.slice();altered[0]^=1;let correct=false;
 const h=setup({fetchImpl:()=>source(correct?payload:altered)}),bad=await h.handler(request(),h.env);
 assert.equal(bad.status,502);assert.equal(h.bucket.records.size,0);assert.equal((await bad.json()).code,'MODEL_INTEGRITY_OR_STORAGE_FAILED');
 correct=true;const retry=await h.handler(request(),h.env);assert.equal(retry.status,200);assert.deepEqual(new Uint8Array(await retry.arrayBuffer()),payload);assert.equal(h.fetches.length,2,'failed single-flight must be released');
});

test('declared length mismatch is rejected before any put',async()=>{
 const h=setup({fetchImpl:()=>source(payload,{length:'999'})}),response=await h.handler(request(),h.env);
 assert.equal(response.status,502);assert.equal((await response.json()).code,'MODEL_LENGTH_MISMATCH');assert.equal(h.bucket.calls.put,0);
});

test('unknown upstream Content-Length is accepted through the fixed-length stream',async()=>{
 const h=setup({fetchImpl:()=>source(payload,{length:null})}),response=await h.handler(request(),h.env);
 assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),payload);assert.deepEqual(h.lengths,[payload.length]);
});

for(const delta of [-1,1])test(`stream ${delta<0?'underflow':'overflow'} fails closed even without a Content-Length header`,async()=>{
 const changed=delta<0?payload.slice(1):new Uint8Array([...payload,0]);const h=setup({fetchImpl:()=>source(changed,{length:null})});
 const response=await h.handler(request(),h.env);assert.equal(response.status,502);assert.equal(h.bucket.records.size,0);
});

test('parallel cold requests for the same hash share one download and one R2 put',async()=>{
 const h=setup(),responses=await Promise.all(Array.from({length:5},()=>h.handler(request(),h.env)));
 assert.equal(h.fetches.length,1);assert.equal(h.bucket.calls.put,1);
 for(const response of responses){assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),payload);}
});

test('an existing object must carry the pinned checksum and byte length',async()=>{
 for(const record of [{bytes:payload,checksum:'0'.repeat(64)},{bytes:payload.slice(1),checksum:descriptor.sha256}]){
  const h=setup();h.bucket.records.set(key,record);const response=await h.handler(request(),h.env);
  assert.equal(response.status,502);assert.equal((await response.json()).code,'MODEL_INTEGRITY_FAILED');assert.equal(h.fetches.length,0);assert.equal(h.bucket.calls.put,0);
 }
});

test('conditional-write race rereads the verified winner without serving its cancelled upstream',async()=>{
 const bucket=bucketMock(),originalPut=bucket.put;
 bucket.put=async function(name,body,options){this.records.set(name,{bytes:payload,checksum:descriptor.sha256});return originalPut.call(this,name,body,options);};
 const h=setup({bucket}),response=await h.handler(request(),h.env);assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),payload);assert.equal(bucket.calls.put,1);
});

test('R2 failures and an unavailable upstream never fall back to unvalidated bytes',async()=>{
 const bucket=bucketMock();bucket.put=async()=>{throw Error('storage offline');};
 const h=setup({bucket}),response=await h.handler(request(),h.env);assert.equal(response.status,502);assert.equal(bucket.records.size,0);
 const missing=setup({fetchImpl:()=>new Response('missing',{status:404})});assert.equal((await missing.handler(request(),missing.env)).status,502);assert.equal(missing.bucket.calls.put,0);
});

test('HEAD and conditional GET use verified R2 metadata and never return a body',async()=>{
 const h=setup(),head=await h.handler(request({method:'HEAD'}),h.env);assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('Content-Length'),String(payload.length));
 const same=await h.handler(request({headers:{'If-None-Match':`W/"${descriptor.sha256}"`}}),h.env);assert.equal(same.status,304);assert.equal(await same.text(),'');assert.equal(h.fetches.length,1);
});
