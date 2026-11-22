/** Server-owned per-room state. Each completed room emits one receipt candidate;
 * the online transaction persists that candidate with the quest/XP exactly once.
 * No client field can set progress, solved flags or a completed room. */
import { distance, position } from '../combat/geometry.mjs';
import { CombatError } from '../combat/engine.mjs';

const clone = value => structuredClone(value);
const requirement = (condition, code) => { if (!condition) throw new CombatError(code); };
const point = (x, z, y = 0) => ({ x, y, z });
export const STONE_ROOM_ORDER = Object.freeze(['M28', 'M29', 'M30', 'M31', 'M32', 'M33', 'M34']);
const base = {
  M28: { name: '路威守门', contentId: 'B1-E10', units: 4, hint: '启动持续演奏装置，等路威安静后沿安全线穿过活板门。音乐会保持，独自一人也能通过。' },
  M29: { name: '魔鬼网', contentId: 'B1-E11', units: 8, hint: '先放松身体，再开启房内明火。两个根结可按顺序处理，已完成的结果会保持。' },
  M30: { name: '飞钥匙房', contentId: 'B1-E12', units: 4, hint: '在地面观察并标记折翼钥匙，然后骑上扫帚接近它。地面标记不会消失。' },
  M31: { name: '巫师棋阵', contentId: 'B1-E13', units: 8, hint: '观察发亮的友方棋子，指挥一次后走到亮起的安全格。独自一人可依次完成三回合。' },
  M32: { name: '倒下的巨怪', contentId: null, units: 0, hint: '这只巨怪已经倒下。观察痕迹确认有人先到，不能攻击尸体获得经验。' },
  M33: { name: '药水逻辑关', contentId: 'B1-E14', units: 4, hint: '先读两处线索：左侧小瓶可向前，另一端供返回。通行份额按本次人数提供。' },
  M34: { name: '魔镜密室', contentId: 'B1-E15', units: 20, hint: '击败奇洛并完成魔镜和通路保护。此房只接受真实战斗胜利回执。' },
};
function idValid(id) { return typeof id === 'string' && id.length > 0 && id.length <= 120; }
export function createRoom({ roomId, runId, playerIds, now = 0 } = {}) {
  requirement(base[roomId] && idValid(runId), 'INVALID_DUNGEON_ROOM');
  requirement(Array.isArray(playerIds) && playerIds.length >= 1 && playerIds.length <= 5 && new Set(playerIds).size === playerIds.length && playerIds.every(idValid), 'PARTY_SIZE_1_TO_5');
  return { version: 1, roomId, runId, status: 'active', now, startedAt: now, lockedPlayerIds: [...playerIds], flags: {}, pending: {}, receipts: {}, events: [], sequence: 0, participants: [], failures: 0, chessTurn: 0, chessCommandAt: null, flyingPlayers: [] };
}
function event(state, type, detail = {}) {
  state.events.push({ id: `${state.runId}:${state.roomId}:${++state.sequence}`, type, at: state.now, ...detail });
  if (state.events.length > 60) state.events.shift();
}
function qualified(state, playerId) { if (!state.participants.includes(playerId)) state.participants.push(playerId); }
function finish(state) {
  if (state.status === 'completed') return;
  state.status = 'completed'; state.completedAt = state.now; state.pending = {};
  state.completionReceipt = { id: `${state.runId}:${state.roomId}:complete`, roomId: state.roomId, contentId: base[state.roomId].contentId, units: base[state.roomId].units, participants: [...state.participants], at: state.now };
  event(state, 'room_completed', { receiptId: state.completionReceipt.id });
}
const target = (id, name, at, durationMs, enabled = true, requiredSkillId = null) => ({ id, name, position: at, durationMs, enabled, requiredSkillId, range: 2 });
export function roomTargets(state, now = state.now) {
  const f = state.flags, active = state.status === 'active';
  let targets = [];
  if (state.roomId === 'M28') targets = [
    target('music', '启动持续演奏装置', point(-1.5, 3), 3000, !f.music),
    target('gate', '沿安静的通路通过路威', point(0, -6), 1000, !!f.music),
  ];
  if (state.roomId === 'M29') targets = [
    target('relax', '放松身体，停止挣扎', point(0, 3), 2000, !f.relax),
    target('fire', '打开墙边明火灯', point(-1.5, -.5), 2000, !!f.relax && !f.fire),
    target('root-left', '处理左侧退缩根结', point(-1.5, -4), 2000, !!f.fire && !f['root-left']),
    target('root-right', '处理右侧退缩根结', point(1.5, -4), 2000, !!f.fire && !f['root-right']),
    target('gate', '离开已经松开的植物', point(0, -6), 800, !!f['root-left'] && !!f['root-right']),
  ];
  if (state.roomId === 'M30') {
    const elapsed = (now - state.startedAt) / 1000;
    targets = [
      target('observe', '观察并标记折翼钥匙', point(0, 3), 1800, !f.observe, 'mark'),
      target('broom', '骑上房内扫帚', point(-1.5, -.5), 1000, !!f.observe, 'broom'),
      target('key', '捕捉已标记的钥匙', point(Math.sin(elapsed * .6) * 2.5, -3 + Math.cos(elapsed * .6) * 1.5, 1.8), 0, !!f.observe && !f.key, 'broom'),
      target('gate', '使用钥匙开启石门', point(0, -6), 1000, !!f.key),
    ];
  }
  if (state.roomId === 'M31') {
    const columns = [-1.5, 0, 1.5], winning = [0, 2, 1][state.chessTurn];
    for (let i = 0; i < 3; i++) targets.push(target(`piece-${i}`, i === winning ? '发光的友方棋子 · 当前合法着法' : '另一枚棋子 · 当前路线危险', point(columns[i], -.5), 700, state.chessTurn < 3 && state.chessCommandAt === null));
    targets.push(target('safe', '走入亮起的安全格', point(columns[(state.chessTurn + 1) % 3], -4), 0, state.chessCommandAt !== null && now <= state.chessCommandAt + 5000));
    targets.push(target('gate', '通过已经赢下的棋阵', point(0, -6), 800, state.chessTurn >= 3));
  }
  if (state.roomId === 'M32') targets = [target('trace', '观察已经倒下的巨怪和脚印', point(0, -.5), 2000, !f.trace), target('gate', '沿脚印继续深入', point(0, -6), 800, !!f.trace)];
  if (state.roomId === 'M33') targets = [
    target('clue-left', '阅读左侧瓶子线索', point(-1.5, 3), 1000, !f['clue-left']),
    target('clue-right', '阅读另一端的线索', point(1.5, 3), 1000, !f['clue-right']),
    ...[0, 1, 2].map(i => target(`potion-${i}`, ['一组较大的瓶子', '左侧最小的通行瓶', '返回方向的瓶子'][i], point((i - 1) * 1.5, -.5), 1000, !!f['clue-left'] && !!f['clue-right'] && !f.potion)),
    target('gate', '携带通行药水跨过黑火', point(0, -6), 1000, !!f.potion),
  ];
  return targets.map(t => ({ ...t, enabled: active && t.enabled, complete: !!f[t.id] }));
}
function skillsOf(player) { return player.learnedSkillIds ?? player.skills ?? []; }
function allowed(state, definition, player, checkFlight = true) {
  if (!definition || !definition.enabled) return 'MECHANISM_UNAVAILABLE';
  if (!player?.position || !Number.isFinite(player.position.x) || !Number.isFinite(player.position.z)) return 'INVALID_POSITION';
  if (distance(player.position, definition.position) > definition.range + .001) return 'OUT_OF_RANGE';
  if (definition.requiredSkillId && !skillsOf(player).includes(definition.requiredSkillId)) return 'SKILL_NOT_LEARNED';
  if (definition.id === 'key' && checkFlight && (!state.flyingPlayers.includes(player.id) || (player.position.y ?? 0) < .7 || Math.abs((player.position.y ?? 0) - definition.position.y) > 1.5)) return 'MOUNT_AND_APPROACH_KEY';
  return null;
}
function completeTarget(state, pending, player) {
  const { targetId, actionId } = pending;
  const result = { ok: true, code: 'COMPLETED', actionId, targetId };
  if (state.roomId === 'M31' && targetId.startsWith('piece-')) {
    if (Number(targetId.slice(6)) !== [0, 2, 1][state.chessTurn]) {
      state.failures++; event(state, 'wrong_chess_command', { playerId: player.id, retryTurn: state.chessTurn });
      return { ...result, ok: false, code: 'UNSAFE_CHESS_MOVE' };
    }
    state.chessCommandAt = state.now; event(state, 'chess_lane_warning', { turn: state.chessTurn, resolvesAt: state.now + 5000 });
  } else if (state.roomId === 'M31' && targetId === 'safe') {
    state.chessTurn++; state.chessCommandAt = null; event(state, 'chess_turn_completed', { turn: state.chessTurn });
  } else if (state.roomId === 'M33' && targetId.startsWith('potion-')) {
    if (targetId !== 'potion-1') { state.failures++; event(state, 'wrong_potion', { playerId: player.id }); return { ...result, ok: false, code: 'WRONG_POTION_READ_CLUES' }; }
    state.flags.potion = true; state.passageDoses = state.lockedPlayerIds.length;
  } else if (state.roomId === 'M30' && targetId === 'broom') {
    if (!state.flyingPlayers.includes(player.id)) state.flyingPlayers.push(player.id);
  } else state.flags[targetId] = true;
  qualified(state, player.id);
  event(state, 'room_target_completed', { playerId: player.id, targetId });
  if (targetId === 'gate') finish(state);
  return result;
}
/** Caller supplies server-owned live player positions on every room poll/move. */
export function advanceRoom(input, { now = input.now, players = [] } = {}) {
  requirement(Number.isFinite(now) && now >= input.now, 'INVALID_SERVER_TIME');
  const state = clone(input); state.now = now;
  if (state.status !== 'active') return state;
  const byId = Array.isArray(players) ? Object.fromEntries(players.map(p => [p.id, p])) : players;
  if (state.roomId === 'M31' && state.chessCommandAt !== null && now > state.chessCommandAt + 5000) {
    state.chessCommandAt = null; state.failures++; event(state, 'chess_turn_retry', { turn: state.chessTurn });
  }
  for (const [playerId, pending] of Object.entries(state.pending)) {
    const player = byId[playerId];
    // A missing player does not complete while disconnected. The attempt cancels,
    // keeping already solved room flags and consumed reward receipts untouched.
    const definition = roomTargets(state, now).find(t => t.id === pending.targetId);
    const problem = !player ? 'PLAYER_NOT_PRESENT' : allowed(state, definition, player);
    const moved = player && distance(player.position, pending.startPosition) > .15;
    if (problem || moved || player.hp === 0) {
      state.receipts[pending.actionId].result = { ok: false, code: problem ?? (moved ? 'MOVEMENT_INTERRUPTED' : 'DOWNED'), actionId: pending.actionId };
      delete state.pending[playerId]; continue;
    }
    if (now >= pending.completeAt) {
      state.receipts[pending.actionId].result = completeTarget(state, pending, player);
      delete state.pending[playerId];
    }
  }
  return state;
}
export function applyRoomIntent(input, { playerId, actionId, targetId, player, now = input.now } = {}) {
  requirement(idValid(actionId) && input.lockedPlayerIds.includes(playerId) && player?.id === playerId, 'INVALID_ROOM_ACTOR');
  // Call advanceRoom with all authoritative members before this method when other
  // players have pending interactions; this method only handles this actor.
  const state = clone(input); state.now = now;
  requirement(Number.isFinite(now) && now >= input.now, 'INVALID_SERVER_TIME');
  const fingerprint = JSON.stringify([playerId, targetId]);
  if (state.receipts[actionId]) { requirement(state.receipts[actionId].fingerprint === fingerprint, 'ACTION_ID_CONFLICT'); return { state, result: clone(state.receipts[actionId].result) }; }
  const reject = code => ({ state, result: { ok: false, code, actionId } });
  if (state.status !== 'active') return reject('ROOM_FINISHED');
  if (state.roomId === 'M34') return reject('BOSS_VICTORY_REQUIRED');
  if (state.pending[playerId]) return reject('ACTION_IN_PROGRESS');
  const definition = roomTargets(state, now).find(t => t.id === targetId), problem = allowed(state, definition, player);
  if (problem) return reject(problem);
  const pending = { actionId, targetId, playerId, startPosition: position(player.position), startAt: now, completeAt: now + definition.durationMs };
  state.pending[playerId] = pending;
  const result = { ok: true, code: 'ACCEPTED', actionId, targetId, completeAt: pending.completeAt };
  state.receipts[actionId] = { fingerprint, result };
  if (definition.durationMs === 0) { state.receipts[actionId].result = completeTarget(state, pending, player); delete state.pending[playerId]; }
  return { state, result: clone(state.receipts[actionId].result) };
}
export function confirmRoomBossVictory(input, encounter) {
  requirement(input.roomId === 'M34' && encounter.kind === 'stone' && encounter.status === 'won', 'BOSS_VICTORY_REQUIRED');
  requirement(input.boundEncounterId === encounter.id, 'ENCOUNTER_RUN_MISMATCH');
  requirement(encounter.lockedPlayerIds.every(id => input.lockedPlayerIds.includes(id)), 'ROSTER_MISMATCH');
  requirement(Object.values(encounter.enemies).every(enemy => enemy.hp <= 0) && encounter.mechanics.mirror && encounter.mechanics.passage, 'BOSS_INCOMPLETE');
  const state = clone(input); state.now = encounter.now;
  for (const id of encounter.validParticipants) qualified(state, id);
  finish(state); return state;
}
export function bindRoomEncounter(input, encounter) {
  requirement(input.roomId === 'M34' && input.status === 'active' && encounter.kind === 'stone' && encounter.status === 'active', 'INVALID_ROOM_ENCOUNTER');
  requirement(!input.boundEncounterId || input.boundEncounterId === encounter.id, 'ENCOUNTER_ALREADY_BOUND');
  requirement(encounter.lockedPlayerIds.length === input.lockedPlayerIds.length && encounter.lockedPlayerIds.every(id => input.lockedPlayerIds.includes(id)), 'ROSTER_MISMATCH');
  return { ...clone(input), boundEncounterId: encounter.id };
}
export function getRoomView(state) {
  const view = clone(state); delete view.receipts;
  return { ...view, ...base[state.roomId], targets: roomTargets(state), allowsFlight: state.roomId === 'M30', flightEnabledFor: [...state.flyingPlayers] };
}
