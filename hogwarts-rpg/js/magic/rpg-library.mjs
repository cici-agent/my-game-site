import { CHARACTERS, ITEMS } from './rpg-catalog.mjs';
import { SKILLS, VOLUMES, SCENES } from './rpg-story.mjs';

const portraitIds = new Set(['harry', 'ron', 'hermione']);
const catalogState = new WeakMap();
const numerals = ['零', '一', '二', '三', '四', '五', '六', '七'];
const volumeName = book => '第' + (numerals[book] || book) + '卷';
const itemBooks = {
  'diary-trace': 2, 'map-reading': 3, 'egg-song': 4, 'da-coin': 5,
  'memory-vial': 6, 'hallows-sketch': 7,
};

function el(tag, className = '', content = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function heading(title, note) {
  const head = el('header', 'rgl-head');
  head.append(el('h2', '', title));
  if (note) head.append(el('p', '', note));
  return head;
}

function disclosure(label, nodes) {
  const details = el('details', 'rgl-details');
  details.append(el('summary', '', label), ...nodes);
  return details;
}

function field(label, value) {
  const row = el('div', 'rgl-field');
  row.append(el('dt', '', label), el('dd', '', value));
  return row;
}

function button(label, active) {
  const control = el('button', 'rgl-control', label);
  control.type = 'button';
  control.setAttribute('aria-pressed', String(active));
  return control;
}

function ruleTabs(labels, active, onSelect) {
  const controls = el('div', 'rgl-controls');
  for (const [key, label] of labels) {
    const control = button(label, active === key);
    control.addEventListener('click', () => {
      for (const other of controls.children) {
        other.setAttribute('aria-pressed', String(other === control));
      }
      onSelect(key);
    });
    controls.append(control);
  }
  return controls;
}

function portrait(person, big = false) {
  const frame = el('span', 'rgl-portrait' + (big ? ' rgl-portrait-large' : ''));
  frame.setAttribute('aria-hidden', 'true');
  const words = person.name.split('·');
  frame.append(el('span', '', words[words.length - 1][0]));
  if (portraitIds.has(person.id)) {
    const img = el('img');
    img.alt = '';
    img.src = './assets/rpg/' + person.id + '.webp';
    img.addEventListener('error', () => img.remove(), { once: true });
    frame.append(img);
  }
  return frame;
}

function profile(person, member, book) {
  const card = el('article', 'rgl-profile');
  const nameplate = el('div', 'rgl-nameplate');
  const text = el('div');
  text.append(el('span', 'rgl-label', volumeName(person.book) + '登场'), el('h3', '', person.name));
  nameplate.append(portrait(person, true), text);
  card.append(nameplate);

  const excerpt = el('blockquote', 'rgl-quote', '“' + person.voice + '”');
  excerpt.append(el('cite', '', '游戏原创对白'));
  const facts = el('dl', 'rgl-facts');
  const meetings = SCENES.filter(scene => scene.steps.some(step => step.npc === person.id));
  facts.append(field('身份', person.role), field('常见地点', person.place), field('角色动机', person.desire),
    field('本篇相遇', meetings.length ? meetings.map(scene => scene.title).join('、') : '收录于人物册'),
    field('角色玩法设定', person.play));
  const bond = member?.bonds?.[person.id] || 0;
  if (member) facts.append(field('我的羁绊', bond > 0 ? '已积累 ' + bond + ' 点' : '尚无羁绊记录'));
  if (person.book > book) {
    card.append(disclosure('展开' + volumeName(person.book) + '人物资料', [excerpt, facts]));
  } else {
    card.append(excerpt, facts);
  }
  card.append(disclosure('展开后续人物线', [el('p', '', person.arc)]));
  return card;
}

function characters(section, state, member, currentBook) {
  section.append(heading('人物册', '按登场卷查阅人物，选择名字翻开档案。'));
  const search = el('input', 'rgl-search');
  search.type = 'search';
  search.placeholder = '搜索姓名、身份或地点';
  search.setAttribute('aria-label', '搜索人物');
  search.value = state.query || '';
  const select = el('select', 'rgl-select');
  select.setAttribute('aria-label', '筛选登场卷');
  for (const [value, label] of [[0, '全部卷目'], ...VOLUMES.map(v => [v.book, volumeName(v.book)])]) {
    const option = el('option', '', label);
    option.value = String(value);
    option.selected = value === (state.volume || 0);
    select.append(option);
  }
  const tools = el('div', 'rgl-tools');
  tools.append(search, select);
  const spread = el('div', 'rgl-spread');
  const navigation = el('div', 'rgl-names');
  navigation.setAttribute('role', 'group');
  navigation.setAttribute('aria-label', '人物名单');
  const panel = el('div', 'rgl-panel');
  spread.append(navigation, panel);
  section.append(tools, spread);

  function filter() {
    state.query = search.value;
    state.volume = Number(select.value);
    const q = state.query.trim().toLowerCase();
    const people = CHARACTERS.filter(p =>
      (!state.volume || p.book === state.volume) &&
      (p.name + p.role + p.place).toLowerCase().includes(q)
    ).sort((a, b) => a.book - b.book);
    navigation.replaceChildren();
    panel.replaceChildren();
    if (!people.length) {
      navigation.append(el('p', 'rgl-empty', '没有找到匹配的人物。'));
      return;
    }
    const chosen = people.find(p => p.id === state.person) || people[0];
    state.person = chosen.id;
    for (const person of people) {
      const item = button('', person.id === chosen.id);
      item.className = 'rgl-person';
      const words = el('span');
      words.append(el('strong', '', person.name), el('small', '', volumeName(person.book) + ' · ' + person.role));
      item.append(portrait(person), words);
      item.addEventListener('click', () => {
        state.person = person.id;
        for (const other of navigation.children) other.setAttribute('aria-pressed', String(other === item));
        panel.replaceChildren(profile(person, member, currentBook));
      });
      navigation.append(item);
    }
    panel.append(profile(chosen, member, currentBook));
  }
  search.addEventListener('input', filter);
  select.addEventListener('change', filter);
  filter();
}

function itemsView(section, state, member, teamItems, currentBook) {
  section.append(heading('道具', '个人物品随角色记录，共享线索由整支队伍查阅。'));
  const grid = el('div', 'rgl-item-grid');
  const owned = item => item.ownership === '队伍' ? teamItems.includes(item.id) : Boolean(member?.items?.includes(item.id));
  const counts = {
    mine: ITEMS.filter(i => i.ownership === '个人' && owned(i)).length,
    team: ITEMS.filter(i => i.ownership === '队伍' && owned(i)).length,
  };
  function list(mode) {
    state.inventory = mode;
    grid.replaceChildren();
    const shown = ITEMS.filter(i => mode === 'all' || (owned(i) && i.ownership === (mode === 'mine' ? '个人' : '队伍')));
    if (!shown.length) {
      grid.append(el('p', 'rgl-empty', mode === 'mine' ? '当前角色还没有收藏道具。' : '队伍还没有取得共享道具。'));
      return;
    }
    for (const item of shown) {
      const details = el('details', 'rgl-item rgl-details');
      const summary = el('summary');
      const labels = el('span', 'rgl-item-title');
      labels.append(el('small', 'rgl-label', item.kind + ' · ' + item.ownership), el('strong', '', item.name));
      summary.append(labels, el('span', 'rgl-status' + (owned(item) ? ' is-owned' : ''), owned(item) ? '已持有' : '未取得'));
      const facts = el('dl', 'rgl-facts');
      facts.append(field('来源', item.source), field('用途', item.use));
      details.append(summary);
      if ((itemBooks[item.id] || 1) > currentBook) {
        details.append(disclosure('展开' + volumeName(itemBooks[item.id]) + '来源与剧情用途', [facts]));
      } else {
        details.append(facts);
      }
      grid.append(details);
    }
  }
  const mode = state.inventory || 'all';
  section.append(ruleTabs([['all', '全部道具'], ['mine', '个人收藏 ' + counts.mine], ['team', '队伍持有 ' + counts.team]], mode, list), grid);
  list(mode);
}

function growth(section, member) {
  section.append(heading('成长', member ? member.name + '的能力与人物羁绊。' : '建立或加入战役后，这里会记录你的能力与人物羁绊。'));
  const skills = el('section', 'rgl-section');
  skills.append(el('h3', '', '能力'));
  const grid = el('div', 'rgl-skill-grid');
  for (const skill of SKILLS) {
    const known = Boolean(member?.skills?.includes(skill.id));
    const card = el('article', 'rgl-skill');
    card.append(el('span', 'rgl-status' + (known ? ' is-owned' : ''), known ? '已习得' : '待学习'), el('h4', '', skill.name), el('p', '', skill.description));
    grid.append(card);
  }
  skills.append(grid);
  const bonds = el('section', 'rgl-section');
  bonds.append(el('h3', '', '人物羁绊'));
  const rows = el('ul', 'rgl-bonds');
  const met = CHARACTERS.filter(p => (member?.bonds?.[p.id] || 0) > 0)
    .sort((a, b) => member.bonds[b.id] - member.bonds[a.id]);
  for (const person of met) {
    const row = el('li');
    row.append(portrait(person), el('strong', '', person.name), el('span', 'rgl-label', member.bonds[person.id] + ' 点'));
    rows.append(row);
  }
  if (!met.length) bonds.append(el('p', 'rgl-empty', '在剧情中与人物交流、伸出援手后，羁绊会记在这里。'));
  else bonds.append(rows);
  section.append(skills, bonds);
}

function volumes(section, campaign) {
  section.append(heading('卷目', '依原著顺序排列。展开某一卷，可查看故事概要及已开放的场景。'));
  const shelf = el('div', 'rgl-volumes');
  for (const volume of VOLUMES) {
    const scenes = SCENES.map((scene, index) => ({ scene, index })).filter(({ scene }) => scene.book === volume.book);
    const vol = el('details', 'rgl-details rgl-volume');
    const title = el('summary');
    title.append(el('span', 'rgl-label', volumeName(volume.book)), el('strong', '', volume.title),
      el('small', 'rgl-status', scenes.length ? scenes.length + ' 个场景' : '剧情规划'));
    vol.append(title, el('p', 'rgl-arc', volume.arc));
    if (scenes.length) {
      const list = el('ol', 'rgl-scene-list');
      for (const {scene, index} of scenes) {
        let status = '待探索';
        if (campaign?.finished || (campaign && index < campaign.sceneIndex)) status = '已完成';
        else if (campaign && index === campaign.sceneIndex) status = '进行中';
        const row = el('li');
        row.append(el('span', '', scene.title), el('small', 'rgl-label', status));
        list.append(row);
      }
      vol.append(list);
    }
    shelf.append(vol);
  }
  section.append(shelf);
}

export function renderLibrary(container, tab, campaign, memberId, featured) {
  const state = catalogState.get(container) || {};
  if (tab === 'characters' && featured && CHARACTERS.some(person => person.id === featured)) {
    state.person = featured;
    state.query = '';
    state.volume = 0;
  }
  catalogState.set(container, state);
  const section = el('section', 'rgl');
  const member = campaign?.members?.[memberId];
  const last = SCENES[SCENES.length - 1];
  const currentBook = (campaign?.finished ? last : SCENES[campaign?.sceneIndex ?? 0])?.book || 1;
  if (tab === 'characters') characters(section, state, member, currentBook);
  else if (tab === 'items') itemsView(section, state, member, campaign?.teamItems || [], currentBook);
  else if (tab === 'growth') growth(section, member);
  else if (tab === 'volumes') volumes(section, campaign);
  container.replaceChildren(section);
}
