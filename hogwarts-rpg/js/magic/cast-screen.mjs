import { HEROES } from './adventure-rules.mjs';
import { bindCastControls, cycleCast } from './cast-controls.mjs';
import { openWardrobe } from './wardrobe-studio.mjs';
import { supportsWardrobe } from '../../world/wardrobe.mjs';

const order = Object.keys(HEROES);
const portraits = id => '/assets/rpg/cast-' + id + '.webp';
const biographies = {
  harry: '额前有一道闪电形伤疤的黑发少年。遇到危险，他总会先举起魔杖，挡在朋友前面。',
  ron: '出身巫师大家庭的红发少年。在棋盘上学到的牵制战术，到了决斗场上也派得上用场。',
  hermione: '她总能在旧课本里找到线索。一句咒语、一次运杖，她都要练到分毫不差。',
  neville: '温室里每一盆草药他都认得。伙伴受伤时，这个平日腼腆的少年总会第一个伸手。',
  george: '韦斯莱双胞胎中的恶作剧高手。他的口袋里藏着响豆，也藏着替伙伴脱身的好主意。'
};
const statScale = Object.fromEntries(['hp', 'focus'].map(stat => [
  stat, Math.max(...Object.values(HEROES).map(hero => hero[stat]))
]));

export function createCastScreen({ state, commands, submit, restore, cancel }) {
  const view = document.getElementById('cast-screen');
  const get = id => view.querySelector('#' + id);
  const surface = get('cast-surface');
  const roster = get('cast-roster-list');
  const nameInput = get('cast-name');
  const nameEditor = get('cast-name-edit');
  const startButton = get('cast-start');
  let selected = 'harry', controls, locked = false, editing = false;
  const has3D = () => state().graphicsAvailable !== false;

  for (const id of order) {
    const hero = HEROES[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cast-student';
    button.dataset.hero = id;
    const portrait = document.createElement('img');
    portrait.className = 'cast-portrait';
    portrait.src = portraits(id);
    portrait.alt = '';
    portrait.draggable = false;
    const copy = document.createElement('span');
    copy.className = 'cast-student-copy';
    const name = document.createElement('strong');
    name.append(hero.name.split('·')[0]);
    const family = document.createElement('span');
    family.className = 'cast-family';
    family.textContent = hero.name.slice(name.textContent.length);
    name.append(family);
    button.setAttribute('aria-label', hero.name + '，' + hero.title);
    const role = document.createElement('small');
    role.textContent = hero.title;
    copy.append(name, role);
    button.append(portrait, copy);
    roster.append(button);
  }

  function select(id, immediate = false) {
    const {profile} = state();
    if (locked || editing || !HEROES[id] || (profile?.activeDungeon && id !== profile.heroId)) return;
    selected = id;
    const h = HEROES[id];
    view.dataset.hero = id;
    for (const button of roster.children) {
      const chosen = button.dataset.hero === id;
      button.setAttribute('aria-pressed', String(chosen));
      button.disabled = Boolean(profile?.activeDungeon && !chosen);
      if (chosen && roster.scrollWidth > roster.clientWidth) {
        const bounds = roster.getBoundingClientRect();
        const item = button.getBoundingClientRect();
        if (item.left < bounds.left) roster.scrollLeft += item.left - bounds.left;
        else if (item.right > bounds.right) roster.scrollLeft += item.right - bounds.right;
      }
    }
    view.querySelector('.cast-copy').scrollTop = 0;
    get('cast-name-title').textContent = h.name;
    get('cast-role').textContent = h.title;
    get('cast-description').textContent = biographies[id];
    for (const stat of ['hp', 'focus']) {
      get('cast-' + stat).textContent = h[stat];
      get('cast-' + stat + '-fill').style.width = (100 * h[stat] / statScale[stat]) + '%';
    }
    get('cast-signature').textContent = h.active.name;
    get('cast-active-description').textContent = h.active.description;
    get('cast-talent').textContent = h.passive.name;
    get('cast-passive-description').textContent = h.passive.description;
    get('cast-error').textContent = '';
    const available = has3D();
    get('cast-wardrobe').hidden = !available || !supportsWardrobe(id);
    view.querySelector('.cast-inspect-tools').hidden = !available;
    view.querySelector('.cast-fallback').hidden = available;
    if (available) commands.castScene.select(id, immediate);
    else {
      get('cast-fallback-portrait').src = portraits(id);
      get('cast-fallback-portrait').alt = h.name;
    }
  }

  function step(direction) {
    const focusInRoster = roster.contains(document.activeElement);
    select(cycleCast(order, selected, direction));
    if (focusInRoster) roster.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
  }
  function editName(open) {
    editing = open;
    nameEditor.hidden = !open;
    if (open) {
      nameInput.focus();
      nameInput.select();
    } else {
      get('cast-player').textContent = nameInput.value.trim() || '同学';
      get('cast-edit').focus({preventScroll:true});
    }
  }
  async function confirm() {
    if (locked || editing) return;
    if (!has3D()) { window.location.reload(); return; }
    const name = nameInput.value.trim();
    if (!name) { editName(true); return; }
    locked = true;
    startButton.disabled = true;
    view.setAttribute('aria-busy', 'true');
    get('cast-error').textContent = '';
    try { await submit(selected, name); }
    catch (error) { get('cast-error').textContent = error.message; }
    finally {
      locked = false;
      startButton.disabled = false;
      view.removeAttribute('aria-busy');
    }
  }
  function hide() {
    controls?.dispose();
    controls = null;
    editing = false;
    nameEditor.hidden = true;
    if (view.open) view.close();
    document.body.classList.remove('casting');
    if (has3D()) commands.castScene.end();
  }
  function show() {
    const {profile, enrolled, playing} = state();
    controls?.dispose();
    locked = false;
    editing = false;
    nameEditor.hidden = true;
    nameInput.value = profile?.name && (enrolled || profile.name !== '新生') ? profile.name : '同学';
    get('cast-player').textContent = nameInput.value;
    let label = '进入冒险';
    if (!has3D()) label = '重新载入';
    else if (!profile) label = '重新读取存档';
    else if (playing) label = '以此角色继续';
    else if (enrolled) label = '继续冒险';
    get('cast-start-label').textContent = label;
    startButton.disabled = false;
    get('cast-back').hidden = !playing;
    get('cast-context').textContent = profile?.activeDungeon ? '副本续玩' : '选择角色';
    document.body.classList.add('casting');
    if (!view.open) view.showModal();
    select(profile?.heroId || order[0], true);
    get('cast-context').focus({preventScroll:true});
    controls = bindCastControls({
      surface, isActive:() => view.open && !editing && !locked, step, confirm,
      rotate:radians => { if (has3D()) commands.castScene.rotate(radians); },
      onInputMode:mode => { view.dataset.input = mode; }
    });
  }

  roster.addEventListener('click', event => {
    const button = event.target.closest('button[data-hero]');
    if (button) select(button.dataset.hero);
  });
  get('cast-zoom-out').onclick = () => { if (!locked && has3D()) commands.castScene.zoom(-1); };
  get('cast-zoom-in').onclick = () => { if (!locked && has3D()) commands.castScene.zoom(1); };
  get('cast-reset').onclick = () => { if (!locked && has3D()) commands.castScene.resetView(); };
  startButton.onclick = confirm;
  get('cast-edit').onclick = () => { if (!locked) editName(!editing); };
  get('cast-name-done').onclick = () => editName(false);
  nameInput.onkeydown = event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); editName(false); }
  };
  get('cast-restore').onclick = () => { if (!locked) restore(); };
  get('cast-wardrobe').onclick = () => {
    if (!locked && has3D()) openWardrobe({variant:selected, onClose:() => get('cast-wardrobe').focus()});
  };
  get('cast-back').onclick = () => { if (!locked) cancel(); };
  view.oncancel = event => {
    event.preventDefault();
    if (locked) return;
    if (editing) editName(false);
    else if (state().playing) cancel();
  };
  return {show, hide, isOpen:() => view.open};
}
