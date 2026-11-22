import { AdventureError, handleAdventure, chapterStages, chapterIdentity, importPartyLearning } from './dungeon-server.mjs';
import { createCampaign, joinCampaign, advanceCampaign } from './js/magic/rpg-engine.mjs';
import { SCENES } from './js/magic/rpg-story.mjs';
import {normalizeEquipment,supportsWardrobe} from './world/wardrobe.mjs';

const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const route = /^\/api\/parties\/([A-HJ-NP-Z2-9]{8})(?:\/(join|actions|presence|boat|depart))?$/i;
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const encoder = new TextEncoder();
const partyQuery = 'SELECT creator, access, campaign, revision FROM rpg_parties WHERE code = ?';

class ApiError extends Error {
  constructor(status, message, campaign) {
    super(message);
    this.status = status;
    this.campaign = campaign;
  }
}
function reply(data, status = 200) {
  return Response.json(data, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
async function digest(purpose, token) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(purpose + ':' + token)));
}
async function parseBody(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, '请用 JSON 提交请求。');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, '请求格式有误。');
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const {value,done} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new ApiError(413, '请求内容太长。'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, '请求格式有误。');
  return value;
}
function player(body) {
  const name = typeof body.name === 'string' ? body.name.trim().normalize('NFC') : '';
  if (!name || [...name].length > 20 || /[\u0000-\u001f\u007f]/u.test(name)) throw new ApiError(400, '请填写 1 到 20 个字符的玩家名字。');
  const token = body.clientToken === undefined ? hex(crypto.getRandomValues(new Uint8Array(32))) : body.clientToken;
  if (typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token)) throw new ApiError(400, '重试凭证格式有误。');
  return { name, token: token.toLowerCase() };
}
async function readRoom(db, code) {
  const row = await db.prepare(partyQuery).bind(code).first();
  if (!row) throw new ApiError(404, '找不到这个队伍，请核对队伍码。');
  return {creator:row.creator, access:JSON.parse(row.access), campaign:JSON.parse(row.campaign)};
}
async function memberKey(request) {
  const match = /^Bearer ([a-f\d]{64})$/i.exec(request.headers.get('Authorization') || '');
  if (!match) throw new ApiError(401, '请用原角色的凭证重新进入队伍。');
  return hex(await digest('player-access',match[1].toLowerCase()));
}
function identify(room, key) {
  if (!Object.hasOwn(room.access,key)) throw new ApiError(401, '玩家凭证无效，请用原角色重新进入队伍。');
  return room.access[key];
}

async function register(db, requested, body) {
  const {name,token} = player(body);
  const key = hex(await digest('player-access', token));
  if (body.requestId!==undefined && (typeof body.requestId!=='string' || !/^[a-zA-Z0-9_-]{8,96}$/.test(body.requestId))) throw new ApiError(400,'队伍操作编号无效。');
  // Classic clients retain their original room code; new chapters can form a fresh party with the same account.
  const seed=body.requestId ? token+':'+body.requestId : token;
  const code = requested || Array.from((await digest('room-code',seed)).subarray(0,8), b => letters[b & 31]).join('');
  const memberId = crypto.randomUUID();
  if (!requested) {
    const campaign = joinCampaign(createCampaign(), memberId, name);
    if (body.requestId) campaign.chapterLobby=true;
    const result = await db.prepare('INSERT INTO rpg_parties (code, creator, access, campaign, revision) VALUES (?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING')
      .bind(code, key, JSON.stringify({[key]:memberId}), JSON.stringify(campaign), campaign.revision).run();
    if (result.meta.changes === 1) return {code,token,memberId,campaign};
  }
  // Four seats bound ordinary contention. CAS also protects against a simultaneous story action.
  for (let attempt = 0; attempt < 8; attempt++) {
    const room = await readRoom(db,code);
    if (!requested && room.creator !== key) throw new ApiError(409, '队伍码发生碰撞，请重新创建队伍。');
    if (room.access[key]) return {code,token,memberId:room.access[key],campaign:room.campaign};
    if (!requested && room.campaign.chapterLobby) throw new ApiError(409,'你已离开这个队伍，请重新创建队伍或使用队伍码加入。');
    let campaign;
    try { campaign = joinCampaign(room.campaign, memberId, name); }
    catch (err) { throw new ApiError(422,err.message); }
    const access = {...room.access, [key]:memberId};
    const result = await db.prepare('UPDATE rpg_parties SET access = ?, campaign = ?, revision = ? WHERE code = ? AND revision = ?')
      .bind(JSON.stringify(access),JSON.stringify(campaign),campaign.revision,code,room.campaign.revision).run();
    if (result.meta.changes === 1) return {code,token,memberId,campaign};
  }
  throw new ApiError(503,'队伍正在更新，请再试一次。');
}

async function departParty(db,key,code,body) {
  for (let attempt=0;attempt<8;attempt++) {
    const room=await readRoom(db,code);
    const chapter=room.campaign.chapterLobby===true;
    const memberId=room.access[key];
    if (!memberId) {
      if (chapter) return {departed:true,released:false};
      identify(room,key);
    }
    // A delayed exit for an earlier seat must not release a subsequent invitation.
    if (body.memberId && body.memberId!==memberId) return {departed:true,released:false};
    if (!chapter) {
      await db.prepare("DELETE FROM rpg_presence WHERE code=? AND member=? AND scene LIKE 'chapter-%'").bind(code,memberId).run();
      return {departed:true,released:false};
    }
    const previous=room.campaign.revision;
    delete room.access[key];
    delete room.campaign.members[memberId];
    room.campaign.revision++;
    const access=JSON.stringify(room.access);
    const [result]=await db.batch([
      db.prepare('UPDATE rpg_parties SET access=?,campaign=?,revision=? WHERE code=? AND revision=?')
        .bind(access,JSON.stringify(room.campaign),previous+1,code,previous),
      db.prepare(`DELETE FROM rpg_presence WHERE code=? AND member=?
        AND EXISTS(SELECT 1 FROM rpg_parties WHERE code=? AND revision=? AND access=?)`)
        .bind(code,memberId,code,previous+1,access)
    ]);
    if (result.meta.changes) return {departed:true,released:true};
  }
  throw new ApiError(409,'队伍正在更新，请再试一次。');
}

async function takeAction(db, key, code, body) {
  const {revision, choiceIndex} = body;
  if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(choiceIndex) || choiceIndex < 0) throw new ApiError(400, '请选择有效的行动和存档版本。');
  const room = await readRoom(db,code);
  const memberId = identify(room,key);
  if (room.campaign.chapterLobby) throw new ApiError(409,'这是同行队伍，章节进度随各位玩家保存。');
  if (room.campaign.revision === revision) {
    let campaign;
    try { campaign = advanceCampaign(room.campaign,memberId,revision,choiceIndex); }
    catch (err) { throw new ApiError(422,err.message,room.campaign); }
    // One D1 transaction records the request and commits the new state only for its expected revision.
    const result = await db.batch([
      db.prepare('INSERT INTO rpg_receipts (code, revision, member, choice) SELECT code, revision, ?, ? FROM rpg_parties WHERE code = ? AND revision = ?')
        .bind(memberId,choiceIndex,code,revision),
      db.prepare('UPDATE rpg_parties SET campaign = ?, revision = ? WHERE code = ? AND revision = ?')
        .bind(JSON.stringify(campaign),campaign.revision,code,revision)
    ]);
    if (result[1].meta.changes === 1) return {campaign};
  }
  const latest = await readRoom(db,code);
  const prior = await db.prepare('SELECT member, choice FROM rpg_receipts WHERE code = ? AND revision = ?').bind(code,revision).first();
  if (prior?.member === memberId && prior.choice === choiceIndex) return {campaign:latest.campaign};
  throw new ApiError(409,'队友已推进，请查看最新进度。',latest.campaign);
}

// A pose is transient and independent of story revisions. Keep one bounded slot per seat.
const peerLifetime = 15_000;
const actionWindow = 2_500;
const sceneNames = new Set([...SCENES.map(scene => scene.id), ...chapterStages.map(id=>'chapter-'+id)]);
const rounded = n => Math.round(n * 100) / 100;

function poseEvent(id, age, now) {
  if (id == null && age == null) return null;
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(age) || age < 0 || age > actionWindow) {
    throw new ApiError(400, '角色动作时间无效。');
  }
  return { id, at: now - Math.round(age) };
}

function readPose(body, now) {
  const {x, y = 0, z, yaw, moving, casting} = body;
  if (!sceneNames.has(body.sceneId) || ![x,z,yaw,y].every(Number.isFinite)
    || Math.abs(x) > 4096 || Math.abs(z) > 4096 || y < -1 || y > 30
    || typeof moving !== 'boolean' || typeof casting !== 'boolean') {
    throw new ApiError(400, '请提交当前场景中有效的角色动作。');
  }
  return {
    x:rounded(x), y:rounded(y), z:rounded(z), yaw:rounded(Math.atan2(Math.sin(yaw),Math.cos(yaw))),
    moving, casting, jump:poseEvent(body.jumpId,body.jumpAge,now), cast:poseEvent(body.castId,body.castAge,now)
  };
}

function peerView(row, member, now) {
  const pose = JSON.parse(row.pose);
  const fresh = now - row.seen_at < 2_500;
  const jumpAge = pose.jump ? Math.max(0, now - pose.jump.at) : null;
  const castAge = pose.cast ? Math.max(0, now - pose.cast.at) : null;
  const recentJump = jumpAge !== null && jumpAge < actionWindow;
  const recentCast = castAge !== null && castAge < actionWindow;
  return {
    id:row.member, name:member.name, ...(pose.hero ? {hero:pose.hero} : {}), ...(Number.isFinite(pose.escort) ? {escort:pose.escort} : {}), x:pose.x, z:pose.z, yaw:pose.yaw, y:fresh ? pose.y : 0,
    equipment:supportsWardrobe(pose.hero||'base')?normalizeEquipment(pose.hero||'base',pose.equipment):undefined,
    moving:fresh && pose.moving, jumping:fresh && pose.y > 0.02,
    casting:(fresh && pose.casting) || (recentCast && castAge < 850),
    jumpId:recentJump ? pose.jump.id : null, jumpAge:recentJump ? jumpAge : null,
    castId:recentCast ? pose.cast.id : null, castAge:recentCast ? castAge : null
  };
}

async function currentBoat(db, code, now) {
  const boat=await db.prepare('SELECT depart_at AS departAt, arrive_at AS arriveAt FROM rpg_boat_trips WHERE code=? AND arrive_at>?').bind(code,now).first();
  return {boat:boat || null,serverNow:now};
}
async function boardBoat(db,key,code) {
  const [room,person]=await Promise.all([readRoom(db,code),chapterIdentity(db,key)]);
  identify(room,key);
  if (!person || person.stage!=='lake' || person.active_code) throw new ApiError(409,'请先跟海格走到黑湖码头。');
  const now=Date.now(), departAt=now+4500, arriveAt=departAt+6500;
  // One active sailing per party. Arrivals after departure wait for the next trip.
  await db.prepare(`INSERT INTO rpg_boat_trips(code,depart_at,arrive_at) VALUES (?,?,?)
    ON CONFLICT(code) DO UPDATE SET depart_at=excluded.depart_at,arrive_at=excluded.arrive_at
    WHERE rpg_boat_trips.arrive_at<=?`).bind(code,departAt,arriveAt,now).run();
  return currentBoat(db,code,now);
}

async function exchangePresence(db, key, code, body) {
  const room = await readRoom(db,code);
  const memberId = identify(room,key);
  if (typeof body.stream !== 'string' || !/^[a-zA-Z0-9-]{8,72}$/.test(body.stream)) {
    throw new ApiError(400, '请重新进入场景以连接队友。');
  }
  const {campaign} = room;
  const {revision} = campaign;
  const response = {revision, peers:[]};
  if (body.revision !== revision) response.campaign = campaign;
  if (body.leave === true) {
    await db.prepare('DELETE FROM rpg_presence WHERE code=? AND member=? AND stream=?')
      .bind(code,memberId,body.stream).run();
    return response;
  }
  const now = Date.now();
  const pose = readPose(body,now);
  let scene = (SCENES[campaign.sceneIndex] || SCENES.at(-1)).id;
  if (body.sceneId.startsWith('chapter-')) {
    const identity=await chapterIdentity(db,key);
    if (!identity || identity.active_code) return response;
    scene='chapter-'+identity.stage;
    pose.hero=identity.hero;
    if (scene==='chapter-lake' && Number.isFinite(body.escort)) pose.escort=Math.max(0,Math.min(1,body.escort));
  }
  if (body.sceneId !== scene) {
    response.campaign = campaign;
    return response;
  }
  if(supportsWardrobe(pose.hero||'base'))pose.equipment=normalizeEquipment(pose.hero||'base',body.equipment);
  const statements = [
    db.prepare(`INSERT INTO rpg_presence (code, member, stream, scene, pose, seen_at)
      SELECT ?, ?, ?, ?, ?, ? FROM rpg_parties WHERE code=? AND revision=?
      ON CONFLICT(code,member) DO UPDATE SET stream=excluded.stream, scene=excluded.scene,
        pose=excluded.pose, seen_at=excluded.seen_at
      WHERE excluded.stream != rpg_presence.stream OR excluded.scene != rpg_presence.scene
        OR excluded.seen_at - rpg_presence.seen_at >= 4800
        OR (excluded.seen_at - rpg_presence.seen_at >= 500 AND excluded.pose != rpg_presence.pose)`)
      .bind(code,memberId,body.stream,scene,JSON.stringify(pose),now,code,revision),
    db.prepare('SELECT member, pose, seen_at FROM rpg_presence WHERE code=? AND scene=? AND member!=? AND seen_at>? LIMIT 3')
      .bind(code,scene,memberId,now-peerLifetime)
  ];
  if (scene==='chapter-lake') Object.assign(response,await currentBoat(db,code,now));
  const [,roster] = await db.batch(statements);
  response.peers = roster.results
    .filter(row => Object.hasOwn(campaign.members,row.member))
    .map(row => peerView(row,campaign.members[row.member],now));
  return response;
}

export async function handleParty(request, env) {
  try {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (request.method === 'POST' && origin && origin !== url.origin) throw new ApiError(403,'请从当前游戏网址操作。');
    // Start with the primary so a remote guest sees the host's acknowledged writes immediately.
    const db = env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
    if (url.pathname === '/api/profile' || /^\/api\/dungeons(?:\/|$)/.test(url.pathname)) {
      const key=await memberKey(request);
      const body=request.method==='POST' ? await parseBody(request) : null;
      if (url.pathname==='/api/profile' && request.method==='GET' && url.searchParams.get('existing')==='1' && !(await chapterIdentity(db,key))) {
        throw new ApiError(404,'没有找到这个恢复码对应的存档，请核对后重试。');
      }
      if (url.pathname==='/api/profile' && body?.action==='import-party') {
        if (typeof body.code!=='string' || !/^[A-HJ-NP-Z2-9]{8}$/i.test(body.code)) throw new ApiError(400,'请填写有效的原队伍码。');
        const room=await readRoom(db,body.code.toUpperCase());
        return reply(await importPartyLearning(db,key,room.campaign.members[identify(room,key)]));
      }
      return reply(await handleAdventure(db,key,url.pathname,request.method,body),url.pathname==='/api/dungeons' && request.method==='POST' ? 201 : 200);
    }
    if (url.pathname === '/api/parties' && request.method === 'POST') return reply(await register(db,null,await parseBody(request)),201);
    const match = route.exec(url.pathname);
    if (!match) throw new ApiError(404,'找不到这个地址，请检查队伍码。');
    const code = match[1].toUpperCase();
    if (request.method === 'POST' && match[2] === 'join') return reply(await register(db,code,await parseBody(request)));
    if (request.method === 'GET' && !match[2]) {
      const key = await memberKey(request);
      const room = await readRoom(db,code);
      return reply({memberId:identify(room,key),campaign:room.campaign});
    }
    if (request.method === 'POST' && match[2] === 'depart') {
      return reply(await departParty(db,await memberKey(request),code,await parseBody(request)));
    }
    if (request.method === 'POST' && match[2] === 'boat') {
      await parseBody(request);
      return reply(await boardBoat(db,await memberKey(request),code));
    }
    if (request.method === 'POST' && match[2] === 'presence') return reply(await exchangePresence(db,await memberKey(request),code,await parseBody(request)));
    if (request.method === 'POST' && match[2] === 'actions') return reply(await takeAction(db,await memberKey(request),code,await parseBody(request)));
    throw new ApiError(405,'不支持这个请求方式。');
  } catch (err) {
    if (!(err instanceof ApiError) && !(err instanceof AdventureError)) return reply({error:'存档暂时不可用，请稍后重试。'},503);
    return reply({error:err.message,...(err.campaign ? {campaign:err.campaign} : {})},err.status);
  }
}
