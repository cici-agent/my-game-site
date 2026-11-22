import { contentData } from '../data/index.mjs';
import { getSceneNavigation } from './scene-navigation.mjs';
import { iconMarkup } from './ui-icons.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const count = value => Math.max(0, Math.floor(finite(value)));
const list = value => Array.isArray(value) ? value : [];
const itemById = new Map(contentData.items.map(item => [item.itemId, item]));
const questById = new Map(contentData.quests.map(quest => [quest.id, quest]));
const scenes = contentData.scenes.filter(scene => scene.id !== 'SC00');
const sceneById = new Map(scenes.map(scene => [scene.id, scene]));
const slotNames = { weapon: '魔杖', top: '校袍', gloves: '手套' };
const heroNames = { harry: '哈利', ron: '罗恩', hermione: '赫敏' };
const statNames = { maxHp: '最大生命', hp: '最大生命', spellPower: '咒力', physicalDefense: '物理防御', magicDefense: '魔法防御', focusMax: '专注上限', focusRegenPerSecond: '专注恢复', crit: '暴击率', haste: '急速' };
const statText = (key, value, sign = false) => `${sign && value > 0 ? '+' : ''}${['crit', 'haste'].includes(key) ? `${(value * 100).toFixed(1)}%` : Number(value.toFixed(2))}`;
const itemDefinition = id => itemById.get(id) ?? { itemId: String(id ?? ''), name: '未识别物品', effect: {}, category: 'unknown' };
const sectionTabs = (entries, current, attribute, label) => `<nav class="journal-tabs" aria-label="${esc(label)}">${entries.map(([id, name, amount]) => `<button type="button" ${attribute}="${esc(id)}" aria-pressed="${id === current}">${esc(name)}${amount == null ? '' : `<span>${count(amount)}</span>`}</button>`).join('')}</nav>`;
const emptyDetail = (title, copy) => `<aside class="journal-detail journal-detail-empty"><span class="journal-empty-seal" aria-hidden="true">✦</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></aside>`;

function inventoryEntries(character) {
  const bag = list(character.inventory).map(id => ({ id, item: itemDefinition(id), quantity: 1, permanent: false, category: itemDefinition(id).effect?.slot ? 'equipment' : 'other' }));
  for (const type of ['health', 'focus']) {
    const quantity = count(character.potions?.[type]);
    if (quantity) { const id = `ITEM-POTION-${type.toUpperCase()}`; bag.push({ id, item: itemDefinition(id), quantity, permanent: false, category: 'consumables' }); }
  }
  const bagIds = new Set(bag.map(entry => entry.id));
  const permanent = [...new Set([...list(character.tools), ...list(character.collectionItems), ...list(character.appearances)])].filter(id => !bagIds.has(id)).map(id => ({ id, item: itemDefinition(id), quantity: 1, permanent: true, category: 'collection' }));
  return { entries: [...bag, ...permanent], occupied: bag.length };
}

function equipmentComparison(item, character) {
  const current = itemById.get(character.equipment?.[item.effect.slot]);
  const before = current?.effect?.stats ?? {}, after = item.effect?.stats ?? {};
  const keys = [...new Set([...Object.keys(after), ...Object.keys(before)])];
  return `<section class="journal-comparison"><h4>与当前${esc(slotNames[item.effect.slot] ?? '装备')}对比</h4><p class="journal-caption">${esc(current?.name ?? '尚未装备')}</p>${keys.length ? `<dl>${keys.map(key => { const value = finite(after[key]), old = finite(before[key]), delta = value - old; return `<div><dt>${esc(statNames[key] ?? key)}</dt><dd><span class="journal-before">${esc(statText(key, old))}</span><span aria-hidden="true"> → </span>${esc(statText(key, value))}<strong class="journal-delta" data-direction="${delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'}">${delta ? esc(statText(key, delta, true)) : '持平'}</strong></dd></div>`; }).join('')}</dl>` : '<p class="journal-caption">基础装备，没有额外属性加成。</p>'}</section>`;
}

function inventoryDetail(entry, character) {
  if (!entry) return emptyDetail('整理你的行囊', '选择一个物品，查看用途、数量与装备属性。');
  const { item, quantity, permanent, id } = entry, stats = Object.entries(item.effect?.stats ?? {});
  const potion = item.category === 'potion', slot = item.effect?.slot;
  const category = permanent ? '永久收藏' : potion ? '消耗品' : slotNames[slot] ?? '随身物品';
  const requiredLevel = item.unlock?.requiredLevel ?? 1, missingQuests = list(item.unlock?.requiredQuestIds).filter(questId => !list(character.completedQuestIds).includes(questId));
  const equipAllowed = finite(character.level, 1) >= requiredLevel && !missingQuests.length;
  const inCombat = character.encounter?.status === 'active';
  const effect = potion ? `使用后恢复${item.effect.basis === 'maxHp' ? '最大生命' : '最大专注'}的 ${Math.round(item.effect.restoreFraction * 100)}%。` : item.effect?.description;
  return `<aside class="journal-detail" aria-label="物品详情"><div class="journal-detail-heading"><span class="journal-detail-icon">${iconMarkup(id)}</span><div><small>${esc(category)}</small><h3>${esc(item.name)}</h3><span class="journal-badge">${permanent ? '永久拥有 · 不占格子' : `数量 ${quantity}${potion ? ' · 同类药剂占 1 格' : ' · 占 1 格'}`}</span></div></div>${effect ? `<p class="journal-effect">${esc(effect)}</p>` : ''}${stats.length ? `<dl class="journal-stat-list">${stats.map(([key, value]) => `<div><dt>${esc(statNames[key] ?? key)}</dt><dd>${esc(statText(key, finite(value), true))}</dd></div>`).join('')}</dl>` : !effect ? '<p class="journal-effect">随人物保存的基础装备，可在人物面板查看穿戴状态。</p>' : ''}${slot ? `${equipmentComparison(item, character)}<p class="journal-caption">穿戴要求：等级 ${count(requiredLevel)}${list(item.unlock?.requiredQuestIds).map(questId => ` · ${esc(questById.get(questId)?.name ?? questId)}`).join('')}</p><button type="button" class="journal-primary" data-equip="${esc(id)}" ${!equipAllowed || inCombat ? 'disabled' : ''}>${inCombat ? '战斗结束后更换' : equipAllowed ? `装备到${esc(slotNames[slot] ?? '对应部位')}` : `尚未满足穿戴条件`}</button><p class="journal-caption">换下的装备会放回背包，属性变化立即计入人物面板。</p>` : ''}${potion ? `<dl class="journal-stat-list"><div><dt>使用时间</dt><dd>${esc(item.effect.castSeconds)} 秒</dd></div><div><dt>战斗快捷键</dt><dd><kbd>${esc(item.effect.quickKey)}</kbd></dd></div></dl><p class="journal-rule">生命与专注药剂共享每场 ${count(item.effect.sharedUsesPerEncounter)} 次使用额度。可在校园补给点重新准备。</p>` : ''}${permanent ? '<p class="journal-rule">永久收藏随这个人物保存，不占普通背包容量。</p>' : ''}</aside>`;
}

/** Pure renderers: every action is delegated to the app and checked by authority. */
export function renderInventoryPanel({ character = {}, filter = 'all', selectedItemId = null } = {}) {
  filter = ['all', 'equipment', 'consumables', 'collection'].includes(filter) ? filter : 'all';
  const { entries, occupied } = inventoryEntries(character), capacity = count(character.bagCapacity);
  const shown = entries.filter(entry => filter === 'all' || entry.category === filter), selected = shown.find(entry => entry.id === selectedItemId) ?? shown[0];
  const free = Math.max(0, capacity - occupied), permanentCount = entries.filter(entry => entry.permanent).length;
  const counts = id => id === 'all' ? entries.length : entries.filter(entry => entry.category === id).length;
  const tabs = sectionTabs([['all', '全部物品'], ['equipment', '装备'], ['consumables', '消耗品'], ['collection', '收藏']].map(([id, name]) => [id, name, counts(id)]), filter, 'data-bag-filter', '物品分类');
  const cards = shown.map(entry => `<button type="button" class="journal-item" data-item-select="${esc(entry.id)}" data-selected="${entry.id === selected?.id}" data-category="${esc(entry.category)}" data-permanent="${entry.permanent}" aria-pressed="${entry.id === selected?.id}" aria-label="${esc(entry.item.name)}，${entry.permanent ? '永久收藏，不占格子' : `数量 ${entry.quantity}`}" title="${esc(entry.item.name)}"><span class="journal-item-icon">${iconMarkup(entry.id)}</span>${entry.permanent ? '<span class="journal-item-quantity" aria-hidden="true">∞</span>' : `<span class="journal-item-quantity">${entry.quantity}</span>`}<span class="journal-item-name">${esc(entry.item.name)}</span>${entry.permanent ? '<small class="journal-item-kind">永久收藏</small>' : ''}</button>`).join('');
  const blanks = filter === 'all' ? Array.from({ length: free }, (_, index) => `<span class="journal-item journal-item-empty" aria-label="空位 ${index + 1}"><span aria-hidden="true">✧</span></span>`).join('') : '';
  const claims = list(character.pendingClaims);
  return `<section class="journal-shell inventory-panel"><header class="journal-summary"><div><small>随身行囊</small><h3>准备好下一段冒险</h3></div><div class="journal-wallet"><span>金币 <strong>${count(character.wallet?.coins)}</strong></span><span>学习凭证 <strong>${count(character.wallet?.learningCredits)}</strong></span></div></header>${tabs}<div class="journal-split"><div class="journal-main"><div class="journal-capacity"><span>背包容量 <strong>${occupied} / ${capacity}</strong></span><span>${free ? `余 ${free} 格` : '背包已满'}</span><div class="journal-capacity-track" role="progressbar" aria-label="背包使用格数" aria-valuenow="${occupied}" aria-valuemin="0" aria-valuemax="${capacity}"><i style="width:${Math.min(100, capacity ? occupied / capacity * 100 : 0).toFixed(2)}%"></i></div></div><div class="journal-item-grid" aria-label="${esc(filter === 'all' ? '全部物品与空余格子' : '筛选后的物品')}">${cards}${blanks}</div>${!shown.length && filter !== 'all' ? '<p class="journal-empty-note">这一类物品还没有收入行囊。</p>' : ''}<p class="journal-caption">药剂每类占 1 格，可在图标角标查看数量。${permanentCount ? `已收藏 ${permanentCount} 件永久物品，不占背包格子。` : '获得的永久工具与收藏也会出现在这里。'}</p><p class="journal-caption">通过巨怪事件扩至 30 格，期末课程后扩至 36 格。</p></div>${inventoryDetail(selected, character)}</div>${claims.length ? `<section class="journal-claims"><h3>待领取奖励 <span>${claims.length}</span></h3><p class="journal-caption">腾出空间后领取；多选一的奖励只需选择一件。</p>${claims.map(claim => `<div class="journal-claim-options">${list(claim.choices ?? [claim.itemId]).map(id => `<button type="button" data-claim="${esc(claim.id)}" data-item="${esc(id)}">${iconMarkup(id)}<span>领取 ${esc(itemDefinition(id).name)}</span></button>`).join('')}</div>`).join('')}</section>` : ''}</section>`;
}

function skillDetail(skill, character) {
  if (!skill) return emptyDetail('翻开魔法笔记', '选择一项魔法，查看它的用途与学习条件。');
  const learned = list(character.skills).includes(skill.id), trial = list(character.courseTrialSkillIds).includes(skill.id), courseComplete = list(character.completedQuestIds).includes(skill.unlockTask), levelReady = finite(character.level, 1) >= skill.minLevel;
  const shortcut = { bolt: '1', levitate: '2', H1: '3', R1: '3', M1: '3', dodge: 'F', mark: '4', rescue: '5', broom: 'X' }[skill.id];
  return `<aside class="journal-detail" aria-label="魔法详情"><div class="journal-detail-heading"><span class="journal-detail-icon">${iconMarkup(skill.id)}</span><div><small>${skill.role === 'all' ? '通用能力' : `${esc(heroNames[skill.role] ?? '')}专属`}</small><h3>${esc(skill.name)}</h3><span class="journal-badge" data-ready="${learned}">${learned ? '已掌握' : trial ? '本课程可试用' : '尚未学会'}</span></div></div><p class="journal-effect">${esc(skill.effect.replace(/interruptible标签/g, '可打断标记'))}</p><dl class="journal-magic-stats"><div><dt>专注消耗</dt><dd>${count(skill.focusCost)}</dd></div><div><dt>施放起手</dt><dd>${skill.castSeconds ? `${esc(skill.castSeconds)} 秒` : '瞬发'}</dd></div><div><dt>技能冷却</dt><dd>${skill.cooldownSeconds ? `${esc(skill.cooldownSeconds)} 秒` : '无'}</dd></div><div><dt>有效距离</dt><dd>${skill.rangeMeters ? `${esc(skill.rangeMeters)} 米` : '自身'}</dd></div></dl>${skill.id === 'levitate' ? '<p class="journal-rule">起手 0.8 秒；需要持续控物的机关另有 2 秒引导。起手与持续引导会分别显示。</p>' : ''}<section class="journal-learning"><h4>学习条件</h4><div data-complete="${levelReady}"><span aria-hidden="true">${levelReady ? '✓' : '◇'}</span>达到等级 ${count(skill.minLevel)}</div><div data-complete="${courseComplete}"><span aria-hidden="true">${courseComplete ? '✓' : '◇'}</span>完成「${esc(questById.get(skill.unlockTask)?.name ?? skill.unlockTask)}」</div></section><p class="journal-caption">${esc(skill.movement)}</p>${shortcut ? `<p class="journal-shortcut">${learned ? '使用快捷键' : '掌握后使用'} <kbd>${esc(shortcut)}</kbd></p>` : ''}<p class="journal-rule">${skill.gcd ? '触发公共调息。每个技能仍独立计算自己的冷却。' : '不触发公共调息。'}${!learned ? '完成对应课程并达到等级后自动掌握。' : ''}</p></aside>`;
}

export function renderMagicPanel({ character = {}, filter = 'all', selectedSkillId = null } = {}) {
  filter = ['all', 'learned', 'unlearned', 'signature'].includes(filter) ? filter : 'all';
  const skills = contentData.skills.filter(skill => skill.role === 'all' || skill.role === character.heroId), known = new Set(list(character.skills));
  const matches = (skill, type) => type === 'all' || type === 'signature' && skill.role !== 'all' || type === 'learned' && known.has(skill.id) || type === 'unlearned' && !known.has(skill.id);
  const shown = skills.filter(skill => matches(skill, filter)), selected = shown.find(skill => skill.id === selectedSkillId) ?? shown[0];
  return `<section class="journal-shell magic-panel"><header class="journal-summary"><div><small>第一学年 · 魔法笔记</small><h3>${esc(heroNames[character.heroId] ?? '巫师')}的魔法与课程</h3></div><div class="journal-mastery"><strong>${skills.filter(skill => known.has(skill.id)).length}<span> / ${skills.length}</span></strong><small>已经掌握</small></div></header>${sectionTabs([['all', '全部魔法'], ['learned', '已掌握'], ['unlearned', '待学习'], ['signature', '角色专属']].map(([id, name]) => [id, name, skills.filter(skill => matches(skill, id)).length]), filter, 'data-magic-filter', '魔法分类')}<div class="journal-split"><div class="journal-main"><div class="journal-spell-grid">${shown.map(skill => { const learned = known.has(skill.id), trial = list(character.courseTrialSkillIds).includes(skill.id); return `<button type="button" class="journal-spell" data-skill-select="${esc(skill.id)}" data-selected="${skill.id === selected?.id}" data-learned="${learned}" aria-pressed="${skill.id === selected?.id}"><span class="journal-spell-icon">${iconMarkup(skill.id)}</span><span class="journal-spell-copy"><strong>${esc(skill.name)}</strong><small>${skill.role === 'all' ? '通用' : '角色专属'} · 等级 ${count(skill.minLevel)}</small></span><span class="journal-learned-state">${learned ? '已掌握' : trial ? '课堂试用' : '待学习'}</span></button>`; }).join('')}</div>${!shown.length ? '<p class="journal-empty-note">此分类暂时没有魔法。继续课程，逐步掌握新的能力。</p>' : ''}<p class="journal-caption">课程中的试用能力不会代替永久学习。魔法命中、射程与遮挡仍按场景中的实际位置判定。</p></div>${skillDetail(selected, character)}</div></section>`;
}

const worldLayout = {
  SC01: [105, 460], SC02: [280, 460], SC03: [450, 460], SC04: [405, 280],
  SC05: [235, 180], SC06: [235, 315], SC07: [405, 80], SC08: [85, 120],
  SC09: [85, 315], SC10: [610, 375], SC11: [605, 205], SC12: [775, 450],
  SC13: [605, 80], SC14: [780, 205], SC15: [780, 80],
};
const worldEdges = [['SC01', 'SC02'], ['SC02', 'SC03'], ['SC03', 'SC04'], ['SC04', 'SC05'], ['SC04', 'SC06'], ['SC04', 'SC07'], ['SC05', 'SC08'], ['SC06', 'SC09'], ['SC04', 'SC10'], ['SC10', 'SC11'], ['SC10', 'SC12'], ['SC04', 'SC13'], ['SC04', 'SC14'], ['SC14', 'SC15'], ['SC15', 'SC04']];
function availableScenes(character, view) {
  const current = view.sceneId ?? character.sceneId;
  if (Array.isArray(view.destinations)) return new Set([current, ...view.destinations.map(destination => typeof destination === 'string' ? destination : destination.sceneId)]);
  return new Set([current, ...list(character.completedQuestIds).flatMap(id => contentData.questSceneMap[id] ?? []), contentData.questSceneMap[character.currentQuestId]?.[0]]);
}
function worldMap(character, view, selectedSceneId) {
  const current = view.sceneId ?? character.sceneId, available = availableScenes(character, view), selected = sceneById.get(selectedSceneId) ?? sceneById.get(current) ?? scenes[0];
  const paths = worldEdges.map(([a, b]) => { const [x1, y1] = worldLayout[a], [x2, y2] = worldLayout[b], mid = (x1 + x2) / 2; return `<path class="atlas-route" data-open="${available.has(a) && available.has(b)}" d="M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}"/>`; }).join('');
  const locations = scenes.map(scene => { const [x, y] = worldLayout[scene.id], here = scene.id === current, open = available.has(scene.id); return `<button type="button" class="atlas-node" data-scene-select="${esc(scene.id)}" data-current="${here}" data-open="${open}" data-selected="${scene.id === selected.id}" style="left:${(x / 880 * 100).toFixed(4)}%;top:${(y / 540 * 100).toFixed(4)}%" aria-pressed="${scene.id === selected.id}" aria-label="${esc(scene.name)}，${here ? '你在这里' : open ? '路线已开放' : '尚未开放'}"><span class="atlas-node-mark" aria-hidden="true">${here ? '◆' : iconMarkup('map')}</span><strong>${esc(scene.name)}</strong><small>${here ? '你在这里' : open ? '已开放' : '待探索'}</small></button>`; }).join('');
  const upcoming = list(selected.questIds).map(id => questById.get(id)).filter(Boolean).find(quest => !list(character.completedQuestIds).includes(quest.id));
  return `<div class="atlas-scroll"><div class="atlas-world" aria-label="第一学年区域路线总览"><svg viewBox="0 0 880 540" aria-hidden="true"><defs><pattern id="atlas-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="currentColor" stroke-width=".5"/></pattern></defs><rect class="atlas-grid" x="0" y="0" width="880" height="540" fill="url(#atlas-grid)"/><path class="atlas-lake" d="M323 433C346 394 390 372 451 379S517 414 515 451 470 507 416 510 340 482 323 433Z"/><path class="atlas-contour" d="M30 255C150 224 93 56 246 44S380 143 449 152 535 22 842 32M30 275C161 255 110 82 249 69S375 168 453 177 538 47 842 57M535 486C554 456 542 324 653 285S824 305 854 382"/>${paths}<text class="atlas-region-label" x="38" y="40">校园与课程</text><text class="atlas-region-label" x="650" y="305">塔楼与禁林</text><text class="atlas-region-label" x="35" y="515">入学旅程</text><text class="atlas-water-label" x="407" y="416">黑 湖</text></svg>${locations}</div></div><section class="atlas-location-detail"><div><small>${selected.id === current ? '当前位置' : available.has(selected.id) ? '路线已开放' : '随主线逐步开放'}</small><h3>${esc(selected.name)}</h3><p>${selected.zones.map(esc).join(' · ')}</p></div><div>${upcoming ? `<span class="journal-caption">相关主线</span><p>${esc(upcoming.name)}</p>` : '<p class="journal-caption">这里的主线进度已经完成，可经出口返回探索。</p>'}<span class="journal-rule">前往地点需要走到场景出口。此处只查看路线。</span></div></section>`;
}

function localMap(character, view, room) {
  const sceneId = view.sceneId ?? character.sceneId;
  const arena = character.encounter?.arena;
  let nav; try { nav = getSceneNavigation(sceneId, { arena }); } catch { nav = { bounds: [-8, 8, -10, 10], walls: [] }; }
  const bounds = arena?.bounds ?? view.bounds ?? { minX: nav.bounds[0], maxX: nav.bounds[1], minZ: nav.bounds[2], maxZ: nav.bounds[3] };
  const minX = finite(bounds.minX, -8), maxX = Math.max(minX + 1, finite(bounds.maxX, 8)), minZ = finite(bounds.minZ, -10), maxZ = Math.max(minZ + 1, finite(bounds.maxZ, 10));
  const scale = Math.min(548 / (maxX - minX), 368 / (maxZ - minZ)), w = (maxX - minX) * scale, h = (maxZ - minZ) * scale, left = (640 - w) / 2, top = (460 - h) / 2;
  const px = x => left + (finite(x) - minX) * scale, py = z => top + (finite(z) - minZ) * scale, n = value => finite(value).toFixed(2);
  const position = character.position ?? view.spawn ?? { x: 0, z: 0 }, targets = list(view.targets).filter(target => target.position && (target.active || target.completed || ['service', 'training', 'exit'].includes(target.kind)));
  const peers = list(room?.members).filter(member => member.id !== character.id && member.sceneId === sceneId && member.position);
  const walls = list(nav.walls).map(wall => {
    if (wall.shape === 'circle') return `<circle class="atlas-wall" cx="${n(px(wall.x))}" cy="${n(py(wall.z))}" r="${n(Math.max(0, finite(wall.radius)) * scale)}"/>`;
    const box = wall.shape === 'box', x = box ? wall.minX : wall.x - wall.w / 2, z = box ? wall.minZ : wall.z - wall.d / 2;
    const width = box ? wall.maxX - wall.minX : wall.w, depth = box ? wall.maxZ - wall.minZ : wall.d;
    return `<rect class="atlas-wall" x="${n(px(x))}" y="${n(py(z))}" width="${n(width * scale)}" height="${n(depth * scale)}" rx="2"/>`;
  }).join('');
  const markerKind = target => target.kind === 'exit' ? 'exit' : ['service', 'training', 'side'].includes(target.kind) ? 'npc' : 'quest';
  const markers = targets.map((target, index) => `<g class="atlas-target" data-kind="${markerKind(target)}" data-complete="${Boolean(target.completed)}" transform="translate(${n(px(target.position.x))} ${n(py(target.position.z))})"><title>${esc(target.label ?? target.id)}${target.completed ? ' · 已完成' : ''}</title>${target.kind === 'exit' ? '<rect x="-9" y="-9" width="18" height="18" rx="3"/>' : '<circle r="9"/>'}<text y="3.5">${index + 1}</text></g>`).join('');
  const teammateMarkers = peers.map(peer => `<g class="atlas-teammate" data-offline="${finite(view.serverTime) - finite(peer.lastSeenAt) > 30000}" transform="translate(${n(px(peer.position.x))} ${n(py(peer.position.z))})"><title>${esc(peer.name)} · 同行队友</title><circle r="6"/><text y="-11">${esc(peer.name)}</text></g>`).join('');
  return `<div class="atlas-local-layout"><div class="atlas-local"><svg viewBox="0 0 640 460" role="img" aria-label="${esc(view.name ?? sceneById.get(sceneId)?.name ?? '当前区域')}，当前位置与任务标记"><defs><clipPath id="atlas-local-clip"><rect x="${n(left)}" y="${n(top)}" width="${n(w)}" height="${n(h)}" rx="7"/></clipPath><pattern id="atlas-local-grid" width="${n(scale * 2)}" height="${n(scale * 2)}" patternUnits="userSpaceOnUse"><path d="M${n(scale * 2)} 0H0V${n(scale * 2)}" fill="none" stroke="currentColor" stroke-width=".5"/></pattern></defs><rect class="atlas-floor" x="${n(left)}" y="${n(top)}" width="${n(w)}" height="${n(h)}" rx="7"/><rect class="atlas-grid" x="${n(left)}" y="${n(top)}" width="${n(w)}" height="${n(h)}" fill="url(#atlas-local-grid)"/><g clip-path="url(#atlas-local-clip)">${walls}${markers}${teammateMarkers}</g><g class="atlas-player" data-world-x="${esc(finite(position.x))}" data-world-z="${esc(finite(position.z))}" transform="translate(${n(px(position.x))} ${n(py(position.z))})"><title>你的位置</title><circle r="15"/><path transform="rotate(${n(-finite(position.yaw) * 180 / Math.PI)})" d="M0-10 7 8 0 5-7 8Z"/><text y="-23">你</text></g><g class="atlas-compass" transform="translate(592 34)"><path d="M0-13 5 7 0 3-5 7Z"/><text y="-19">北</text></g><path class="atlas-scale" d="M${n(left + 10)} ${n(top + h + 20)}v5h${n(scale * 2)}v-5"/><text class="atlas-scale-label" x="${n(left + 10 + scale)}" y="${n(top + h + 41)}">2 米</text></svg></div><aside class="atlas-target-list"><h3>当前区域</h3><strong>${esc(view.name ?? sceneById.get(sceneId)?.name ?? '')}</strong><p class="journal-caption">${esc(view.quest?.name ?? '')}</p><ol>${targets.map((target, index) => `<li data-kind="${markerKind(target)}" data-complete="${Boolean(target.completed)}"><span>${index + 1}</span><div><strong>${esc(target.label ?? target.id)}</strong><small>${target.completed ? '已完成' : target.kind === 'exit' ? '场景出口' : ['service', 'training', 'side'].includes(target.kind) ? 'NPC / 服务' : '当前目标'}</small></div></li>`).join('')}</ol>${!targets.length ? '<p class="journal-caption">当前没有可交互的任务标记。</p>' : ''}${peers.length ? `<p class="journal-caption">同区域队友：${peers.map(peer => esc(peer.name)).join('、')}</p>` : ''}</aside></div><p class="journal-caption">位置来自当前区域坐标。浅色箭头是你，蓝色圆点是队友；墙体与障碍显示为实体色块。</p>`;
}

export function renderMapPanel({ character = {}, view = {}, room = null, mode = 'world', selectedSceneId = null } = {}) {
  mode = mode === 'local' ? 'local' : 'world';
  const current = sceneById.get(view.sceneId ?? character.sceneId), available = availableScenes(character, view);
  return `<section class="journal-shell atlas-panel"><header class="journal-summary"><div><small>霍格沃茨 · 第一学年</small><h3>${mode === 'world' ? '第一学年 · 世界路线图' : esc(current?.name ?? view.name ?? '当前区域')}</h3></div><div class="journal-map-current"><span class="atlas-current-dot" aria-hidden="true"></span><span>当前位置<strong>${esc(current?.name ?? view.name ?? '旅途中')}</strong></span></div></header>${sectionTabs([['world', '世界总览'], ['local', '当前区域']], mode, 'data-map-mode', '地图视图')}<div class="atlas-legend">${mode === 'world' ? `<span><i class="atlas-legend-open"></i>已开放 ${scenes.filter(scene => available.has(scene.id)).length} / ${scenes.length}</span><span><i class="atlas-legend-locked"></i>随主线开放</span><span class="journal-caption">区域路线示意 · 非地理比例</span>` : '<span><i class="atlas-legend-current"></i>你</span><span><i class="atlas-legend-team"></i>队友</span><span><i class="atlas-legend-open"></i>任务</span><span><i class="atlas-legend-npc"></i>NPC / 服务</span><span><i class="atlas-legend-exit"></i>出口</span>'}</div>${mode === 'world' ? worldMap(character, view, selectedSceneId) : localMap(character, view, room)}</section>`;
}
