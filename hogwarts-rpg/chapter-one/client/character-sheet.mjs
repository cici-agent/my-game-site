import { contentData } from '../data/index.mjs';
import { getXpProgress, MAX_XP_CENTS } from '../rules/index.mjs';
import { iconMarkup } from './ui-icons.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const items = new Map(contentData.items.map(item => [item.itemId, item]));
const slots = [{ id: 'weapon', label: '魔杖', empty: '未装备魔杖' }, { id: 'top', label: '校袍', empty: '基础内衫' }, { id: 'gloves', label: '手套', empty: '未装备手套' }];
const attributes = [['hp', '最大生命'], ['spellPower', '咒力'], ['physicalDefense', '物理防御'], ['magicDefense', '魔法防御'], ['focusMax', '专注上限'], ['focusRegenPerSecond', '专注恢复 / 秒'], ['crit', '暴击率'], ['haste', '急速']];
const names = new Map([...attributes, ['maxHp', '最大生命']]);
const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = value => Math.max(0, Math.min(100, value));
const amount = (key, value) => ['crit', 'haste'].includes(key) ? `${(number(value) * 100).toFixed(1)}%` : Number.isFinite(value) ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value) : '—';
const statSummary = item => Object.entries(item?.effect?.stats ?? {}).filter(([, value]) => Number.isFinite(value) && value !== 0).map(([key, value]) => `${names.get(key) ?? key} ${value > 0 ? '+' : ''}${amount(key, value)}`).join(' · ') || '基础装备 · 无额外属性';
const lockedAttributes = locked => locked ? ' disabled aria-disabled="true" title="战斗中无法更换"' : '';

function equipmentMarkup(character, selectedSlot, inCombat) {
  const equipment = character.equipment ?? {}, selected = slots.find(slot => slot.id === selectedSlot) ?? slots[1];
  const cards = slots.map(slot => {
    const itemId = equipment[slot.id], item = items.get(itemId), chosen = slot.id === selected.id;
    const title = item?.name ?? (itemId ? '当前装备' : slot.empty), summary = itemId ? statSummary(item) : slot.id === 'top' ? '未穿校袍 · 显示基础内衫' : '此部位没有装备加成';
    return `<article class="cs-gear-card${chosen ? ' is-selected' : ''}" data-slot="${slot.id}"><button type="button" class="cs-gear-select" data-gear-select="${slot.id}" aria-pressed="${chosen}" aria-label="查看${slot.label}：${escape(title)}"><span class="cs-gear-icon">${iconMarkup(itemId ?? slot.id)}</span><span class="cs-gear-copy"><small>${slot.label}</small><strong>${escape(title)}</strong><span>${escape(summary)}</span></span></button><div class="cs-gear-footer"><span>${itemId ? '已穿戴' : '空装备槽'}</span>${itemId ? `<button type="button" class="cs-unequip" data-unequip="${slot.id}"${lockedAttributes(inCombat)}>脱下</button>` : ''}</div></article>`;
  }).join('');
  const replacements = [...new Set(character.inventory ?? [])].map(id => items.get(id)).filter(item => item?.effect?.slot === selected.id);
  const choices = replacements.length ? replacements.map(item => `<article class="cs-replacement"><span class="cs-replacement-icon">${iconMarkup(item.itemId)}</span><div><strong>${escape(item.name)}</strong><span>${escape(statSummary(item))}</span></div><button type="button" data-equip="${escape(item.itemId)}"${lockedAttributes(inCombat)} aria-label="穿戴${escape(item.name)}">穿戴</button></article>`).join('') : `<div class="cs-no-replacement"><p>背包中暂无可替换的${selected.label}。</p><button type="button" data-panel="inventory">查看背包</button></div>`;
  const appearance = selected.id === 'top' ? '<p class="cs-appearance-note">装备护衬改变属性，外袍保留工坊原款造型。脱下校袍后显示基础内衫。</p>' : selected.id === 'weapon' ? '<p class="cs-appearance-note">魔杖校准改变属性，仍使用人物原有的精细魔杖造型。</p>' : '<p class="cs-appearance-note">手套改变装备属性；当前人物保留原有手部造型。</p>';
  return `<div class="cs-section-heading"><h3>随身装备</h3><span>3 个部位</span></div>${inCombat ? '<p class="cs-combat-lock" role="status">战斗中无法更换</p>' : '<p class="cs-section-note">选择部位，查看背包中的可换装备。</p>'}<div class="cs-gear-list">${cards}</div><section class="cs-replacement-section" aria-label="可替换${selected.label}"><div class="cs-section-heading"><h4>更换${selected.label}</h4><span>${replacements.length} 件可选</span></div>${choices}${appearance}</section>`;
}

function resource(label, value, maximum, kind) {
  const current = Math.max(0, number(value)), max = Math.max(0, number(maximum)), percentage = max ? clamp(current / max * 100) : 0;
  return `<div class="cs-resource cs-resource-${kind}"><div><span>${label}</span><strong>${amount('', current)} <small>/ ${amount('', max)}</small></strong></div><div class="cs-resource-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(current, max)}"><i style="width:${percentage}%"></i></div></div>`;
}

function statsMarkup(character, hero) {
  const self = character.encounter?.players?.[character.id ?? character.characterId], stats = self?.stats ?? character.stats ?? {};
  const hp = self?.hp ?? character.hp, focus = self?.focus ?? character.focus;
  const xp = character.xp ?? getXpProgress(Math.min(MAX_XP_CENTS, Math.max(0, Math.round(number(character.xpCents)))));
  const earned = Math.max(0, number(xp.earnedThisLevelCents)), required = Math.max(0, number(xp.requiredThisLevelCents));
  const progress = xp.atCap ? 100 : required ? clamp(earned / required * 100) : 0;
  const signature = contentData.skills.find(skill => skill.id === hero.signature), known = character.skills?.includes(hero.signature);
  return `<div class="cs-section-heading"><h3>当前状态</h3><span>装备加成已计入</span></div>${resource('生命', hp, stats.hp, 'health')}${resource('专注', focus, stats.focusMax, 'focus')}<dl class="cs-attributes">${attributes.map(([key, label]) => `<div><dt>${label}</dt><dd>${amount(key, stats[key])}</dd></div>`).join('')}</dl><section class="cs-growth"><div class="cs-section-heading"><h4>成长经验</h4><strong>${progress.toFixed(1)}%</strong></div><div class="cs-xp-track" role="progressbar" aria-label="本级经验" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.toFixed(1)}"><i style="width:${progress}%"></i></div><p>${xp.atCap ? '已达到当前等级上限' : `${amount('', earned / 100)} / ${amount('', required / 100)} 经验`}</p><small>累计 ${amount('', number(character.xpCents) / 100)} 经验</small></section><section class="cs-specialty"><span class="cs-kicker">角色专长</span><h4>${escape(hero.role ?? '魔法学徒')}</h4>${hero.copy ? `<p>${escape(hero.copy)}</p>` : ''}${signature ? `<div class="cs-signature">${iconMarkup(signature.id)}<span><strong>${escape(signature.name)}</strong><small>${known ? '已掌握' : `Lv.${signature.minLevel} · 完成对应课程后掌握`}</small></span></div>` : ''}<div class="cs-traits">${(hero.traits ?? []).map(trait => `<span>${escape(trait)}</span>`).join('')}</div></section>`;
}

/** Replace only these three fragments to preserve the live preview canvas. */
export function characterSheetParts({ character = {}, hero = {}, selectedSlot = 'top' } = {}) {
  const inCombat = character.encounter?.status === 'active';
  return {
    identity: `<div class="cs-identity-copy"><span class="cs-kicker">人物档案</span><h2>${escape(character.name ?? hero.name ?? '魔法学徒')}</h2><p><strong>${escape(hero.name ?? '')}</strong>${hero.role ? `<span>${escape(hero.role)}</span>` : ''}</p></div><div class="cs-level"><small>等级</small><strong>${escape(character.level ?? 1)}</strong><span>Lv.</span></div>`,
    equipment: equipmentMarkup(character, selectedSlot, inCombat),
    stats: statsMarkup(character, hero),
  };
}

export function renderCharacterSheet(options = {}) {
  const parts = characterSheetParts(options);
  return `<div class="character-sheet"><header id="character-identity" class="cs-identity">${parts.identity}</header><div class="cs-layout"><aside id="character-equipment" class="cs-equipment">${parts.equipment}</aside><figure class="cs-preview"><div class="cs-preview-heading"><span class="cs-kicker">人物预览</span><span>拖动旋转</span></div><div id="character-preview" class="cs-preview-frame" aria-label="人物三维预览"></div><figcaption class="cs-preview-controls"><button type="button" data-preview-rotate="-0.5" aria-label="向左旋转人物">↶</button><button type="button" data-preview-reset="true">回到正面</button><button type="button" data-preview-rotate="0.5" aria-label="向右旋转人物">↷</button></figcaption></figure><aside id="character-stats" class="cs-stats">${parts.stats}</aside></div></div>`;
}
