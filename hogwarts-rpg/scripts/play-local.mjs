// Run the same bundled Worker and SQL migrations used by the hosted game.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import worker from '../dist/server/index.js';
import { buildVisualReview, visualReviewHtmlPath } from './visual-review-build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dbPath = process.env.RPG_SAVE_FILE || resolve(root, '.local/adventure.sqlite');
await mkdir(dirname(dbPath), {recursive:true});
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY);');
for (const name of (await readdir(resolve(root, 'drizzle'))).filter(x=>x.endsWith('.sql')).sort()) {
  if (db.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name)) continue;
  const sql = await readFile(resolve(root, 'drizzle', name), 'utf8');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(sql.replaceAll('--> statement-breakpoint',''));
    db.prepare('INSERT INTO local_migrations VALUES (?)').run(name);
    db.exec('COMMIT');
  } catch (err) {db.exec('ROLLBACK');throw err;}
}

function statement(sql, args = []) {
  const stmt=db.prepare(sql);
  return {
    sql,args,bind(...values){return statement(sql,values);},
    first(column){const row=stmt.get(...args)??null;return column ? row?.[column]??null : row;},
    all(){return {results:stmt.all(...args)};},
    run(){return {meta:stmt.run(...args)};}
  };
}
const DB={prepare:statement,batch(statements){
  db.exec('BEGIN IMMEDIATE');
  try {
    const out=statements.map(s=>/^\s*(SELECT|WITH\b.*SELECT)/i.test(s.sql) ? s.all() : s.run());
    db.exec('COMMIT');return out;
  } catch(error){db.exec('ROLLBACK');throw error;}
}};
const port=Number(process.env.PORT || 4177);
const host=process.env.RPG_HOST || '127.0.0.1';
const server=createServer(async(req,res)=>{
  try{
    const assetPath=new URL(req.url,'http://localhost').pathname;
    if(assetPath==='/__review.html'||assetPath==='/__review.mjs'){
      const html=assetPath.endsWith('.html');const body=html?await readFile(visualReviewHtmlPath):await buildVisualReview();
      res.writeHead(200,{'Content-Type':html?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(body);return;
    }
    if(/^\/assets\/chapter-one\/materials\/(brick|stone|wood|floor)-(albedo|normal|roughness)\.jpg$/.test(assetPath)&&['GET','HEAD'].includes(req.method)){
      const body=await readFile(resolve(root,'.'+assetPath));res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':body.length,'Cache-Control':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:body);return;
    }
    const modelPrefix='/assets/chapter-one/workshop/65154a9106f3/assets/3d/magic/characters/';
    if(assetPath.startsWith(modelPrefix)&&['harry-pathfinder.glb','hermione-scholar.glb','ron-weasley.glb'].includes(assetPath.slice(modelPrefix.length))&&['GET','HEAD'].includes(req.method)){
      const body=await readFile(resolve(root,'.'+assetPath));res.writeHead(200,{'Content-Type':'model/gltf-binary','Content-Length':body.length,'Cache-Control':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:body);return;
    }
    const options={method:req.method,headers:req.headers};
    if(!['GET','HEAD'].includes(req.method)){options.body=req;options.duplex='half';}
    const reply=await worker.fetch(new Request(new URL(req.url,'http://'+req.headers.host),options),{DB});
    res.writeHead(reply.status,Object.fromEntries(reply.headers));
    res.end(Buffer.from(await reply.arrayBuffer()));
  } catch(e){console.error(e);res.writeHead(500);res.end('Local server error');}
});
server.listen(port,host,()=>console.log('Hogwarts RPG http://'+host+':'+server.address().port));
