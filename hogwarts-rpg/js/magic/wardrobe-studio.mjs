import { SLOT_LABELS, ITEMS, normalizeEquipment, loadEquipment, saveEquipment } from '../../world/wardrobe.mjs';
import { createWardrobeScene } from '../../world/wardrobe-scene.mjs';

const cast = [
  {id:'harry', name:'哈利·波特', original:'Harry Potter', description:'黑色乱发下露出闪电形伤疤，一副圆眼镜框住绿色的眼睛。', accent:'#bdad80'},
  {id:'ron', name:'罗恩·韦斯莱', original:'Ron Weasley', description:'一头鲜亮的红发，鼻梁两侧散着雀斑。家里织的毛衣是他最熟悉的衣服。', accent:'#c6a686'},
  {id:'hermione', name:'赫敏·格兰杰', original:'Hermione Granger', description:'蓬松的棕色卷发垂在肩侧，学院针织背心和长靴陪她穿过图书馆的走廊。', accent:'#baa48c'},
  {id:'neville', name:'纳威·隆巴顿', original:'Neville Longbottom', description:'鼠尾草绿和圆叶形拼片来自温室。蹲下照料幼苗时，围裹衣摆向两侧展开。', accent:'#a3af85'},
  {id:'george', name:'乔治·韦斯莱', original:'George Weasley', description:'偏心扣、铜绿镶边和藏在翻襟里的道具袋，让他的外套像一件随身的小戏台。', accent:'#ad8d83'},
  {id:'base', name:'基础学生', original:'Student Model', description:'共用的学生体型与关节，用于查看新装备在标准人物身上的穿戴效果。', accent:'#a9b4a2'}
];
const symbols = {
  crest:'<path d="m12 2 7.5 3v6c0 4.6-3.4 7.9-7.5 10-4.1-2.1-7.5-5.4-7.5-10V5z"/><path d="m12 5 1.1 4.3 3.9 1.1-3.9 1.2L12 16l-1.2-4.4L7 10.4l3.8-1.1z"/>',
  top:'<path d="m8 3-5 3-2 5 4 2 2-3v11h10V10l2 3 4-2-2-5-5-3c-.2 4-7.8 4-8 0Z"/>',
  pants:'<path d="M6 3h12l1 18h-5l-2-10-2 10H5z"/><path d="M6 6h12m-6 0v3"/>',
  gloves:'<path d="M8 13V5a1.3 1.3 0 0 1 2.6 0v6-7a1.2 1.2 0 0 1 2.4 0v7-6a1.2 1.2 0 0 1 2.4 0v6-4a1.2 1.2 0 0 1 2.4 0v7c0 2-1 3-1.8 4v3H9v-2l-4.7-6.5A1.5 1.5 0 0 1 6.7 11z"/>',
  shoes:'<path d="M3 10c2.8 1.9 5.5 2.1 8.2-1.7l3.1 3.4 4.6 2.1c1.5.6 2.4 1.7 2.1 3.6H3c-1.3-2-1-4.4 0-7.4Z"/><path d="M3 18.8h18m-7-7.1-1.6 1.4m3.7.2-1.4 1.2"/>',
  weapon:'<path d="m3.2 19.3 2 1.6L18.4 6.1l-1.3-1.2zM7.5 15l2.1 1.9m8.6-16 .4 2m3.8 1.5-2-.1M14.2 2.3l1.1 1.2"/>',
  hat:'<path d="M6.2 16.2 11.4 4l6.3-1.2-3.2 4.1 3.3 9.3M7 13.8c3.5 1 6.4 1 10 0"/><ellipse cx="12" cy="17.3" rx="10" ry="2.8"/>',
  people:'<circle cx="10" cy="8" r="3"/><path d="M3.8 19v-2c0-6.3 12.4-6.3 12.4 0v2zM16 5.8c4.7.3 4.7 6 1.1 6.7m1.1 1.4c2.2.5 3.2 2 3.2 4"/>',
  save:'<path d="M5 3h12l3 3v15H4V3h1zm2 0v6h9V3M7 20v-7h10v7"/>',
  reset:'<path d="M4 10a8 8 0 1 1 .5 6M4 4v6h6"/>',
  exit:'<path d="M14 4h5v16h-5M13 7l-5 5 5 5M8 12h9"/>',
  mirror:'<path d="M5 19V9a7 7 0 0 1 14 0v10zm-1 2h16m-8-16-3 3m6-1-4 4"/>',
  spin:'<path d="M4 8C-1 11 2.5 16 12 16c6.2 0 10-2 10-4.7 0-1.2-1-2.5-3-3.3m-3 5 3 3-3 3"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',
  check:'<path d="m5 12 4.6 4.8L19 7"/>',empty:'<circle cx="12" cy="12" r="7.5"/><path d="m7 17 10-10"/>'
};
const icon = (key, size=20) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">${symbols[key]}</svg>`;
const same = (a,b) => Object.keys(SLOT_LABELS).every(slot => a[slot] === b[slot]);
let active;

function drawMirror(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width = 650, h = canvas.height = 510;
  const cx = w / 2, cy = 226;
  ctx.strokeStyle = '#7b846459';
  ctx.lineWidth = .8;
  function outline(rx, ry, y, end) {
    ctx.beginPath();
    ctx.moveTo(cx-rx, end);
    ctx.lineTo(cx-rx,y);
    ctx.bezierCurveTo(cx-rx,y-ry*.52,cx-rx*.52,y-ry*.81,cx,y-ry);
    ctx.bezierCurveTo(cx+rx*.52,y-ry*.81,cx+rx,y-ry*.52,cx+rx,y);
    ctx.lineTo(cx+rx,end);
    ctx.stroke();
  }
  for (const offset of [0, 5, 18]) outline(181+offset, 177+offset, cy+8, h-36);
  ctx.strokeStyle = '#85907845';
  for (const r of [106,125,160]) {
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  }
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(-.47);
  ctx.beginPath(); ctx.ellipse(0,0,157,66,0,0,Math.PI*2); ctx.stroke();
  ctx.restore();
  for (let i=0;i<96;i++) {
    const a = i*Math.PI/48, r1=160, r2=i%8===0?168:i%4===0?165:162;
    ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1);
    ctx.lineTo(cx+Math.cos(a)*r2,cy+Math.sin(a)*r2);ctx.stroke();
  }
  function star(x,y,size) {
    ctx.fillStyle='#8b8c6c99';ctx.beginPath();ctx.moveTo(x,y-size);
    ctx.quadraticCurveTo(x+.8,y-.8,x+size,y);ctx.quadraticCurveTo(x+.8,y+.8,x,y+size);
    ctx.quadraticCurveTo(x-.8,y+.8,x-size,y);ctx.quadraticCurveTo(x-.8,y-.8,x,y-size);ctx.fill();
  }
  for (const [x,y,s] of [[95,119,5],[119,176,3],[72,203,3],[96,270,2],[510,109,4],[550,139,6],[533,208,3],[587,236,3],[495,302,3],[139,309,3],[428,80,3],[239,106,3],[213,168,2],[540,368,2],[99,366,3]]) star(x,y,s);
}

export function openWardrobe({variant='harry', onClose}={}) {
  if (active) return active;
  const standalone = document.body.hasAttribute('data-wardrobe-page');
  const root = document.createElement(standalone ? 'section' : 'dialog');
  root.className = 'wd-studio';
  root.setAttribute('aria-labelledby','wd-title');
  const outfits = Object.fromEntries(cast.map(person => [person.id, loadEquipment(person.id)]));
  const saved = Object.fromEntries(cast.map(person => [person.id, {...outfits[person.id]}]));
  const query = standalone ? new URLSearchParams(location.search) : new URLSearchParams();
  let person = cast.find(item => item.id === query.get('hero')) || cast.find(item => item.id === variant) || cast[0];
  const requestedSlot = query.get('slot');
  let slot = Object.hasOwn(SLOT_LABELS, requestedSlot) ? requestedSlot : 'top';
  let animation = 'idle', view = 'full', group = 'series', scene, photoJob = 0;
  const hasSeries = () => slot === 'weapon' || slot === 'top';
  const seriesOwner = () => person.id === 'base' ? 'harry' : person.id;
  const slotName = key => key === 'weapon' ? '魔杖' : SLOT_LABELS[key];
  const matchesSeries = item => item.hero === seriesOwner() && Number.isInteger(item.tier);
  const linkedItem = hasSeries() && /^(?:[1-9]|10)$/.test(query.get('tier') || '') &&
    ITEMS[slot].find(item => matchesSeries(item) && item.tier === Number(query.get('tier')));
  function matchingPair(tier) {
    const top = ITEMS.top.find(item => matchesSeries(item) && item.tier === tier);
    const wand = ITEMS.weapon.find(item => matchesSeries(item) && item.tier === tier);
    return top && wand ? {top:top.id, weapon:wand.id} : null;
  }
  const linkedPair = linkedItem && query.get('look') === 'set' ? matchingPair(linkedItem.tier) : null;
  if (linkedItem) outfits[person.id] = {...outfits[person.id], ...(linkedPair || {[slot]:linkedItem.id})};
  const fallback = '当前浏览器无法显示三维画面。仍可选择并保存装扮。';
  root.innerHTML = `
    <header class="wd-mast"><div class="wd-brand"><span class="wd-seal">${icon('crest',28)}</span><span>霍格沃茨 <i>·</i> 七册同行</span></div>
      <button type="button" class="wd-exit" data-close>${icon('exit',17)} 返回冒险</button></header>
    <div class="wd-body">
      <div class="wd-title-row"><h1 id="wd-title">人物衣橱</h1><span lang="en">The Wardrobe</span><i aria-hidden="true"></i></div>
      <div class="wd-grid">
        <aside class="wd-register"><h2>人物名册</h2><div class="wd-people" aria-label="选择人物"></div>
          <div class="wd-note"><span class="wd-nib" aria-hidden="true">✧</span><h3>人物特征</h3><p></p></div></aside>
        <section class="wd-view" aria-label="人物试衣镜">
          <div class="wd-stage"><canvas class="wd-etching" aria-hidden="true"></canvas>
            <div class="wd-stage-label">${icon('mirror',17)} 试衣镜</div>
            <div class="wd-lens" role="group" aria-label="试衣镜视角"><button type="button" data-view="full">全身</button><button type="button" data-view="hand">持杖近看</button></div>
            <canvas class="wd-render" tabindex="0" aria-label="三维人物试衣镜，拖动或使用左右方向键旋转"></canvas><p class="wd-fallback" hidden></p>
            <div class="wd-orbit"><button type="button" data-turn="-1" aria-label="向左旋转">${icon('left',16)}</button><span>${icon('spin',17)} 拖动旋转</span><button type="button" data-turn="1" aria-label="向右旋转">${icon('right',16)}</button></div>
          </div><div class="wd-caption"><div><h2 class="wd-name"></h2><span class="wd-original" lang="en"></span></div>
            <div class="wd-pose" aria-label="预览动作"><button type="button" data-pose="idle">站立</button><button type="button" data-pose="walk">行走</button><button type="button" data-pose="cast">施法</button></div></div>
          <div class="wd-worn" aria-label="当前试穿的上衣和手持物"><div><small>上衣</small><span data-worn="top"></span></div><div><small>持杖</small><span data-worn="weapon"></span></div><button type="button" data-go-catalog>挑选装备</button></div>
        </section>
        <section class="wd-closet" aria-label="装备选择"><div class="wd-closet-title"><h2>装备图鉴</h2><button type="button" data-go-mirror>${icon('mirror',15)} 看试穿</button></div><div class="wd-slots" aria-label="装备部位"></div>
          <div class="wd-items-head"><h3></h3><span></span></div>
          <div class="wd-groups" role="group" aria-label="装备系列"><button type="button" data-group="series">角色十级款</button><button type="button" data-group="basics">基础款</button></div>
          <div class="wd-items" aria-label="可选装备"></div>
          <div class="wd-inspect"><span>当前试穿</span><strong></strong><p></p><button type="button" data-match hidden>${icon('check',15)} 试穿同级搭配</button></div>
          <div class="wd-actions"><span class="wd-status" role="status" aria-live="polite"></span><div><button type="button" data-reset>${icon('reset',16)} 恢复默认</button>
          <button type="button" data-save>${icon('save',17)} 保存装扮</button></div></div></section>
      </div></div>`;
  const q=s=>root.querySelector(s);
  const all=s=>Array.from(root.querySelectorAll(s));
  const makeButton = (html, attr, value) => {
    const button=document.createElement('button');
    button.type='button'; button.dataset[attr]=value; button.innerHTML=html; return button;
  };
  for (const p of cast) {
    const button=makeButton(`<span class="wd-avatar" style="--wd-accent:${p.accent}"><span aria-hidden="true">${p.name[0]}</span><canvas aria-hidden="true"></canvas></span><span class="wd-person-label"><strong>${p.name}</strong><small lang="en">${p.original}</small></span><i class="wd-person-mark" aria-hidden="true">◆</i>`, 'person', p.id);
    q('.wd-people').append(button);
  }
  for (const id of ['top', 'weapon', ...Object.keys(SLOT_LABELS).filter(key => key !== 'top' && key !== 'weapon')]) {
    q('.wd-slots').append(makeButton(`${icon(id,19)}<span>${slotName(id)}</span>`, 'slot', id));
  }
  document.body.append(root);
  document.body.classList.add('wardrobe-open');
  if (!standalone) root.showModal();
  drawMirror(q('.wd-etching'));
  try {
    scene=createWardrobeScene(q('.wd-render'));
    scene.portraits(cast.map(p=>({id:p.id,equipment:normalizeEquipment(p.id),target:q(`[data-person="${p.id}"] canvas`)})));
    root.classList.add('wd-ready');
  } catch (error) {
    console.warn('Wardrobe preview unavailable',error);
    scene?.dispose();scene=null;
    q('.wd-fallback').textContent=fallback; q('.wd-fallback').hidden=false;
    q('.wd-orbit').hidden=true;
    all('[data-pose], [data-view]').forEach(button=>{button.disabled=true;});
  }
  function describeOutfit() {
    const selected = ITEMS[slot].find(item => item.id === outfits[person.id][slot]);
    q('.wd-inspect strong').textContent = selected?.name || '未装备';
    q('.wd-inspect p').textContent = selected?.description || '';
    q('.wd-inspect p').hidden = !selected?.description;
    const matchButton=q('[data-match]');
    matchButton.hidden=!(hasSeries() && selected && matchesSeries(selected));
    if (!matchButton.hidden) matchButton.setAttribute('aria-label',`试穿同级搭配：${person.name} L${selected.tier} 魔杖与上衣`);
    for (const part of ['top','weapon']) {
      const worn = ITEMS[part].find(item => item.id === outfits[person.id][part]);
      q(`[data-worn="${part}"]`).textContent = worn ? `${worn.tier ? 'L'+worn.tier+' · ' : ''}${worn.name}` : '未装备';
    }
  }
  function refreshItems() {
    cancelAnimationFrame(photoJob);
    const series = hasSeries() && group === 'series';
    const items = series ? ITEMS[slot].filter(matchesSeries).sort((a,b)=>a.tier-b.tier) : ITEMS[slot].filter(item=>!item.tier);
    const container = q('.wd-items');
    container.replaceChildren();
    container.scrollTop = 0;
    q('.wd-groups').hidden = !hasSeries();
    q('.wd-items-head h3').textContent = slotName(slot);
    q('.wd-items-head span').textContent = series
      ? `${cast.find(p=>p.id===seriesOwner()).name.split('·')[0]}系列 · ${items.length} 款` : `${items.length} 款`;
    for (const button of all('[data-group]')) button.setAttribute('aria-pressed',String(button.dataset.group===group));
    for (const item of items) {
      const button=makeButton(`<span class="wd-item-photo"><span>${icon(item.id==='none'?'empty':slot,21)}</span><canvas aria-hidden="true"></canvas></span><span class="wd-item-info"></span><i class="wd-tick">${icon('check',13)}</i>`,'item',item.id);
      const copy=button.querySelector('.wd-item-info');
      if (item.tier) {
        const tier=document.createElement('small');
        tier.textContent=`L${item.tier} · ${item.grade}`;
        copy.append(tier);
      }
      const name=document.createElement('span');
      const prefix=item.tier ? item.grade+'·' : '';
      name.textContent=prefix && item.name.startsWith(prefix) ? item.name.slice(prefix.length) : item.name;
      copy.append(name);
      button.style.setProperty('--wd-item',item.color||'#7c8876');
      button.setAttribute('aria-pressed',String(outfits[person.id][slot]===item.id));
      container.append(button);
    }
    for (const button of all('[data-slot]')) button.setAttribute('aria-pressed',String(button.dataset.slot===slot));
    const current=container.querySelector('[aria-pressed="true"]');
    if (current) container.scrollTop=Math.max(0,current.offsetTop-container.clientHeight/2+current.offsetHeight/2);
    describeOutfit();
    if (scene) photoJob=requestAnimationFrame(()=>{
      scene.goods(person.id,outfits[person.id],slot,items.filter(i=>i.id!=='none').map(i=>({id:i.id,target:q(`[data-item="${i.id}"] canvas`)})));
    });
  }
  function setView(next) {
    view=next;
    scene?.setView(view);
    for(const b of all('[data-view]')) b.setAttribute('aria-pressed',String(b.dataset.view===view));
  }
  function showPerson() {
    q('.wd-name').textContent=person.name; q('.wd-original').textContent=person.original;
    q('.wd-note p').textContent=person.description;
    for (const b of all('[data-person]')) b.setAttribute('aria-pressed',String(b.dataset.person===person.id));
    const roster=q('.wd-people');
    if (roster.scrollWidth > roster.clientWidth) {
      const selected=roster.querySelector('[aria-pressed="true"]').getBoundingClientRect();
      const bounds=roster.getBoundingClientRect();
      if (selected.left < bounds.left) roster.scrollLeft += selected.left-bounds.left;
      else if (selected.right > bounds.right) roster.scrollLeft += selected.right-bounds.right;
    }
    scene?.setCharacter(person.id,outfits[person.id]);
    refreshItems();
  }
  function setPose(value) {
    animation=value;scene?.setAnimation(value);
    for(const b of all('[data-pose]')) b.setAttribute('aria-pressed',String(b.dataset.pose===animation));
  }
  const unsaved=()=>cast.filter(p=>!same(saved[p.id],outfits[p.id]));
  function showStatus(message) {
    const count=unsaved().length;
    q('.wd-status').textContent=message ?? (count?`${count} 位人物的装扮待保存`:'装扮保存在当前浏览器');
  }
  function save() {
    const changed=unsaved();
    let failed=false;
    for (const p of changed.length?changed:[person]) {
      const equipment={...outfits[p.id]};
      if (!saveEquipment(p.id,equipment)) { failed=true;continue; }
      saved[p.id]={...equipment};
      window.dispatchEvent(new CustomEvent('wardrobe-change',{detail:{variant:p.id,equipment}}));
    }
    showStatus(failed?'浏览器暂时无法保存装扮。':changed.length>1?`已保存 ${changed.length} 位人物的装扮`:`${(changed[0]||person).name}的装扮已保存`);
  }
  function close() {
    if (unsaved().length && !window.confirm('还有未保存的装扮。离开衣橱并放弃这些改动？')) return;
    cancelAnimationFrame(photoJob); scene?.dispose();
    if (!standalone && root.open) root.close();
    root.remove();document.body.classList.remove('wardrobe-open');active=null;onClose?.();
  }
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.hasAttribute('data-close')) {close();return;}
    if (b.dataset.person) {person=cast.find(p=>p.id===b.dataset.person);showPerson();showStatus();return;}
    if (b.dataset.slot) {slot=b.dataset.slot;group='series';refreshItems();return;}
    if (b.hasAttribute('data-match')) {
      const selected=ITEMS[slot].find(item => item.id === outfits[person.id][slot]);
      const pair=selected && matchesSeries(selected) && matchingPair(selected.tier);
      if (!pair) return;
      outfits[person.id]={...outfits[person.id],...pair};
      scene?.setEquipment(outfits[person.id]);setView('full');describeOutfit();
      showStatus(unsaved().length ? `正在试穿 L${selected.tier} 魔杖与上衣，保存后穿入冒险。` : '此搭配已保存。');
      return;
    }
    if (b.dataset.group) {group=b.dataset.group;refreshItems();return;}
    if (b.dataset.view) {setView(b.dataset.view);return;}
    if (b.hasAttribute('data-go-mirror') || b.hasAttribute('data-go-catalog')) {
      const target = b.hasAttribute('data-go-mirror') ? q('.wd-view') : q('.wd-closet');
      target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      return;
    }
    if (b.dataset.item) {
      outfits[person.id]={...outfits[person.id],[slot]:b.dataset.item};
      scene?.setEquipment(outfits[person.id]);
      for (const option of all('[data-item]')) option.setAttribute('aria-pressed',String(option===b));
      describeOutfit();showStatus();return;
    }
    if (b.dataset.turn) {scene?.rotate(Number(b.dataset.turn)*Math.PI/6);return;}
    if (b.dataset.pose) {setPose(b.dataset.pose);return;}
    if (b.hasAttribute('data-reset')) {
      outfits[person.id]=normalizeEquipment(person.id);showPerson();showStatus();return;
    }
    if (b.hasAttribute('data-save')) save();
  });
  root.addEventListener('cancel',e=>{e.preventDefault();close();});
  root.addEventListener('keydown',e=>{
    if (e.target===q('.wd-render') && ['ArrowRight','ArrowLeft'].includes(e.key)) {
      e.preventDefault();scene?.rotate((e.key==='ArrowLeft'?-1:1)*Math.PI/12);
    }
    if (!standalone) e.stopPropagation();
  });
  showPerson();setPose(animation);setView(view);
  if (linkedPair && unsaved().length) showStatus(`正在试穿 L${linkedItem.tier} 魔杖与上衣，保存后穿入冒险。`);
  else showStatus(linkedItem && unsaved().length ? `正在试穿 L${linkedItem.tier} · ${linkedItem.name}，保存后穿入冒险。` : undefined);
  active={close,element:root};
  return active;
}
