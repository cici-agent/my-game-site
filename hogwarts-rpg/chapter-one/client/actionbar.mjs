import { abilityState, actionBarSlots } from './ability-state.mjs';
import { createIcon } from './ui-icons.mjs';

const formatTime = milliseconds => milliseconds > 10000 ? `${Math.ceil(milliseconds / 1000)}` : Math.max(.1, milliseconds / 1000).toFixed(1);
const shortStatus = { ready: '可用', 'course-trial': '课堂试用', 'not-learned': '尚未学会', downed: '已经倒地', 'encounter-ended': '挑战结束', 'not-participating': '未参与', synchronizing: '同步中', controlled: '受到控制', 'no-stock': '库存为空', 'potion-limit': '本场已用', 'no-charges': '次数用尽', 'combat-only': '战斗中使用', 'combat-restricted': '场地限制', 'no-focus': '专注不足', cooldown: '技能冷却', gcd: '公共调息', casting: '施法中', pending: '等待确认', retrying: '等待连接', 'wrong-role': '专属技能', unavailable: '等待人物', unknown: '不可用' };

export function createActionBar({ container, castContainer } = {}) {
  const doc = container?.ownerDocument ?? castContainer?.ownerDocument ?? globalThis.document;
  let slots = [], stamp = '', castParts = null, disposed = false;
  const make = (tag, className, text = '') => { const node = doc.createElement(tag); node.className = className; node.textContent = text; return node; };
  function setupCast() {
    if (!castContainer || castParts || !doc?.createElement) return;
    const label = make('span', 'cast-label'), time = make('span', 'cast-time'), track = make('div', 'cast-track'), fill = make('i', 'cast-fill'), queue = make('small', 'cast-queue');
    label.setAttribute('role', 'status'); label.setAttribute('aria-live', 'polite'); time.setAttribute('aria-hidden', 'true');
    track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', '施法进度'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.append(fill);
    castContainer.setAttribute('aria-live', 'off'); castContainer.replaceChildren(label, time, track, queue); castParts = { label, time, track, fill, queue };
  }
  function setup(heroId) {
    if (!container || !doc?.createElement) return;
    const definitions = actionBarSlots(heroId), nextStamp = definitions.map(slot => slot.skillId).join('/');
    if (nextStamp === stamp) return; stamp = nextStamp;
    slots = definitions.map(({ key, skillId }) => {
      const button = make('button', 'ability'), hotkey = make('kbd', 'ability-key', key), name = make('span', 'ability-name'), count = make('span', 'ability-count'), timing = make('strong', 'ability-time'), status = make('small', 'ability-status');
      const orb = make('span','ability-orb'), glyph = make('span','ability-glyph'), rings=doc.createElementNS('http://www.w3.org/2000/svg','svg');
      rings.setAttribute('class','ability-rings'); rings.setAttribute('viewBox','0 0 72 72'); rings.setAttribute('aria-hidden','true');
      const ring=(className,radius)=>{const node=doc.createElementNS('http://www.w3.org/2000/svg','circle');for(const [key,value] of Object.entries({class:className,cx:36,cy:36,r:radius,fill:'none',pathLength:100,'stroke-dasharray':100,'stroke-dashoffset':100}))node.setAttribute(key,value);rings.append(node);return node;};
      const track=ring('ability-ring-track',32);track.setAttribute('stroke-dashoffset',0);
      const cooldown=ring('ability-cooldown-ring',32),gcd=ring('ability-gcd-ring',27.5);
      glyph.append(createIcon(doc,skillId,'ability-icon'));orb.append(glyph,rings,timing);
      button.type = 'button'; button.dataset.skill = skillId;timing.setAttribute('aria-hidden','true');
      button.append(hotkey,count,orb,name,status); return { skillId, key, button, cooldown, name, count, timing, status, gcd };
    });
    container.setAttribute('aria-label', '技能与药剂'); container.replaceChildren(...slots.map(slot => slot.button));
  }
  function update(snapshot = {}) {
    if (disposed) return [];
    setup(snapshot.character?.heroId); setupCast();
    const states = slots.map(slot => {
      const state = abilityState({ ...snapshot, skillId: slot.skillId });
      slot.button.disabled = !state.enabled; slot.button.dataset.state = state.status; slot.button.dataset.queued = String(state.queued); slot.button.dataset.potion = String(slot.skillId.startsWith('potion-'));
      slot.name.textContent = state.name; slot.count.hidden = state.count === null; slot.count.textContent = state.count === null ? '' : `×${state.count}`;
      const timing = state.cooldownRemainingMs || state.gcdRemainingMs;
      slot.timing.textContent = timing > 0 ? formatTime(timing) : '';
      slot.timing.hidden=timing<=0;
      slot.timing.dataset.counting = String(timing > 0);
      slot.status.textContent = state.queued ? '已预备' : shortStatus[state.status] ?? state.reason;
      slot.button.dataset.cooling=String(state.cooldownRemainingMs>0);slot.button.dataset.gcd=String(state.gcdRemainingMs>0);slot.button.dataset.casting=String(state.cast?.skillId===slot.skillId);
      slot.cooldown.setAttribute('stroke-dashoffset',String(100*(1-Math.min(1,Math.max(0,state.cooldownRemainingMs/Math.max(1,state.cooldownDurationMs))))));
      slot.gcd.setAttribute('stroke-dashoffset',String(100*(1-Math.min(1,Math.max(0,state.gcdRemainingMs/Math.max(1,state.gcdMs))))));
      slot.button.title = `${state.name} · ${state.reason}\n专注 ${state.focusCost} · 起手 ${state.castSeconds} 秒 · 冷却 ${state.cooldownSeconds} 秒${state.count !== null ? `\n当前库存 ${state.count}` : ''}`;
      slot.button.setAttribute('aria-label', `${slot.key}，${state.name}，${state.reason}${timing > 0 ? `，剩余 ${formatTime(timing)} 秒` : ''}${state.count !== null ? `，库存 ${state.count}` : ''}`);
      return state;
    });
    if (castParts) {
      const cast = states[0]?.cast ?? abilityState({ ...snapshot, skillId: 'bolt' }).cast, queued = snapshot.queuedSkillId ? abilityState({ ...snapshot, skillId: snapshot.queuedSkillId }) : null;
      castContainer.hidden = !cast; castContainer.dataset.phase = cast?.phase ?? 'idle';
      castParts.label.textContent = cast ? `${cast.name} · ${{ windup: '起手', channel: '持续引导', waiting: '等待服务器确认', retrying: '等待连接恢复' }[cast.phase]}` : '下一道魔法已预备';
      castParts.time.textContent = !cast ? '' : cast.remainingMs === null ? `${((cast.elapsedMs ?? 0) / 1000).toFixed(1)} 秒` : `${formatTime(cast.remainingMs)} 秒`;
      castParts.track.hidden = !cast; castParts.fill.style.width = `${cast?.progress === null ? 28 : (cast?.progress ?? 0) * 100}%`;
      if (cast?.progress !== null && cast) castParts.track.setAttribute('aria-valuenow', String(Math.round(cast.progress * 100))); else castParts.track.removeAttribute('aria-valuenow');
      castParts.queue.hidden = !queued; castParts.queue.textContent = queued ? `接下来：${queued.name}` : '';
    }
    return states;
  }
  return { update, dispose() { if (disposed) return; disposed = true; container?.replaceChildren(); castContainer?.replaceChildren(); if (castContainer) castContainer.hidden = true; slots = []; } };
}
