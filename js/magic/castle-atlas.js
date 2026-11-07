// The plan, door gaps, stair flights and destinations come from the same geometry as walking.
import { castleFloors, castleLocation, castleRooms, roomArrival } from './castle-layout.js';
import { groundsTrails, pitch } from './grounds-layout.js';

const $ = id => document.getElementById(id);
const groundLayer = '霍格沃茨校地';
const visitedKey = 'xcn_hogwarts_explored_v1';

function readVisited() {
  try {
    const ids = JSON.parse(localStorage.getItem(visitedKey));
    return new Set(Array.isArray(ids) ? ids : []);
  } catch { return new Set(); }
}

export function createCastleAtlas({ grounds, gate, context, onOpen, onTravel, onRestart }) {
  const dialog = $('castleAtlas'), floorSelect = $('atlasFloor'), search = $('atlasSearch');
  const list = $('atlasList'), chart = $('atlasPlan'), visited = readVisited();
  const extra = [
    {id:'gate', name:'城堡正门', x:gate.x, y:gate.y, z:gate.z + .65, yaw:0, radius:5, description:'石桥尽头是橡木大门。推门进入门厅，正前方通往楼梯，大礼堂在右侧。'},
    {id:'east-pier', name:'黑湖东岸站台', x:82, y:1.45, z:-78, yaw:Math.PI/2, radius:9, description:'列车停在湖边。沿下坡道走向码头，可以看见对岸的城堡。'},
    {id:'station', name:'国王十字车站', x:0, y:0, z:126, yaw:0, radius:49, description:'国王十字车站的砖墙后是九又四分之三站台。地图下方可以重走完整的入学序章。'},
  ];
  const outdoors = [...grounds, ...extra].map(p => ({...p, point:p, layer:groundLayer, area:'grounds', sheet:'grounds'}));
  const indoors = castleRooms.map(r => ({
    id:r.id, name:r.name, area:'castle', room:r, point:roomArrival(r),
    yaw: r.doorZ < 0 ? 0 : Math.PI, sheet:String(r.level),
    layer:castleFloors.find(f => f.level === r.level).name, description:r.hint,
  }));
  const places = [...outdoors, ...indoors];
  const key = p => p.area + '/' + p.id;
  const byKey = new Map(places.map(p => [key(p), p]));
  const layers = [{id:'grounds', name:groundLayer}, ...castleFloors.map(f => ({id:String(f.level), name:f.name}))];
  floorSelect.replaceChildren(...layers.map(l => new Option(l.name, l.id)));
  let selected = null, hits = [];
  function locate() {
    const {area, position:p} = context();
    if (area === 'castle') {
      const {level, name, room, stairs} = castleLocation(p);
      if (room) return byKey.get('castle/' + room.id);
      return { area, id:stairs ? 'stairs' : 'corridor', layer:name, sheet:String(level),
        name:stairs ? '大理石楼梯' : '城堡长廊',
        description:stairs ? '在平台处转弯，沿另一侧台阶前往相邻楼层。' : '沿长廊可进入两侧房间，中央拱门通往楼梯。' };
    }
    let nearest, best = Infinity;
    for (const place of outdoors) {
      const d = Math.hypot(p.x-place.point.x,p.z-place.point.z);
      if (d <= place.radius && d < best) { nearest = place; best = d; }
    }
    return nearest || {area, id:'grounds-path', layer:groundLayer, sheet:'grounds', name:'校园小径',
      description:'沿湖岸和林间小径步行，打开地图可查看地标。'};
  }
  function visit(p) {
    const id = key(p);
    if (!byKey.has(id) || visited.has(id)) return;
    visited.add(id);
    try { localStorage.setItem(visitedKey, JSON.stringify([...visited])); } catch {}
  }
  function visiblePlaces() {
    const query = search.value.trim().toLocaleLowerCase();
    return query ? places.filter(p => (p.name + ' ' + p.layer + ' ' + p.id).toLocaleLowerCase().includes(query)) :
      places.filter(p => p.sheet === floorSelect.value);
  }
  function showDetails() {
    $('atlasSection').textContent = selected?.layer ?? '';
    $('atlasPlace').textContent = selected?.name ?? '没有匹配地点';
    $('atlasNote').textContent = selected?.description ?? '可试试“魔药”“塔”或学院名称。';
    $('atlasTravel').disabled = !selected;
    $('atlasProgress').textContent = '已到访 ' + places.filter(p => visited.has(key(p))).length + ' / ' + places.length + ' 处地点';
  }
  function choose(p) {
    selected = p;
    floorSelect.value = p.sheet;
    for (const b of list.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.place === key(p)));
    showDetails(); draw();
  }
  function populate(preferred = null) {
    const options = visiblePlaces();
    selected = options.includes(preferred) ? preferred : options[0] || null;
    if (selected) floorSelect.value = selected.sheet;
    const buttons = options.map(p => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.place = key(p);
      b.setAttribute('aria-pressed', String(p === selected)); b.append(p.name);
      const detail = document.createElement('small');
      detail.textContent = search.value.trim() ? p.layer.split(' · ')[0] : visited.has(key(p)) ? '已到访' : '◇';
      b.append(detail); b.onclick = () => choose(p);
      return b;
    });
    list.replaceChildren(...buttons);
    showDetails(); draw();
  }
  function open() {
    if (dialog.open) return;
    onOpen();
    const p = locate(); search.value = ''; floorSelect.value = p.sheet;
    dialog.showModal(); populate(byKey.get(key(p)));
    $('closeAtlas').focus({preventScroll:true});
  }

  // Draw in CSS pixels with north at the top, preserving world-coordinate proportions.
  function draw() {
    if (!dialog.open) return;
    const w = chart.clientWidth, h = chart.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return;
    chart.width = Math.round(w*dpr); chart.height = Math.round(h*dpr);
    const ctx = chart.getContext('2d'); ctx.scale(dpr,dpr);
    const outside = floorSelect.value === 'grounds';
    const floor = outside ? null : castleFloors.find(f => String(f.level) === floorSelect.value);
    const showStation = outside && (selected?.id === 'station' || (context().area === 'grounds' && context().position.z > 65));
    const ext = outside ? [-185,98,-190,showStation ? 150 : 46] : [-61,61,-46,39];
    const scale = Math.min((w-22)/(ext[1]-ext[0]),(h-28)/(ext[3]-ext[2]));
    const X = x => (x-(ext[0]+ext[1])/2)*scale+w/2;
    const Z = z => (z-(ext[2]+ext[3])/2)*scale+h/2;
    hits = [];
    function line(points,color,width=1) {
      ctx.beginPath(); points.forEach(([x,z], i) => i ? ctx.lineTo(X(x),Z(z)) : ctx.moveTo(X(x),Z(z)));
      ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
    }
    function rect(a,b,c,d,fill) { ctx.fillStyle=fill; ctx.fillRect(X(a),Z(c),(b-a)*scale,(d-c)*scale); }
    function oval(x,z,rx,rz,fill,stroke) {
      ctx.beginPath(); ctx.ellipse(X(x),Z(z),rx*scale,rz*scale,0,0,Math.PI*2);
      ctx.fillStyle=fill; ctx.fill(); ctx.strokeStyle=stroke; ctx.lineWidth=1; ctx.stroke();
    }
    ctx.save(); ctx.strokeStyle='#77684318'; ctx.lineWidth=.6;
    const grid = outside ? 20 : 10;
    for (let x=Math.ceil(ext[0]/grid)*grid;x<=ext[1];x+=grid) line([[x,ext[2]],[x,ext[3]]],'#89744e1d',.6);
    for (let z=Math.ceil(ext[2]/grid)*grid;z<=ext[3];z+=grid) line([[ext[0],z],[ext[1],z]],'#89744e1d',.6);
    if (outside) {
      oval(5,-87,73,54,'#a9beb5','#778f84'); oval(5,-87,68,49,'#a3b9b1','#94aaa3');
      oval(-42,-153,40,22,'#c8b795','#94845f'); rect(-61,-23,-166,-137,'#9e937b');
      rect(-69,-61,-161,-145,'#9e937b'); rect(-23,-15,-160,-145,'#9e937b');
      for (let i=0;i<92;i++) {
        const x=-151+Math.sin(i*14.21)*31, z=-125+Math.cos(i*8.22)*41;
        if (((x+151)/35)**2+((z+125)/47)**2>1) continue;
        line([[x-1.4,z+1.8],[x,z-1.9],[x+1.4,z+1.8]],'#6f8068',1);
      }
      oval(pitch.x,pitch.z,pitch.rx,pitch.rz,'#bdc2a1','#788465');
      oval(pitch.x,pitch.z,pitch.rx*.85,pitch.rz*.85,'#bdc2a1','#98a17b');
      line([[pitch.x-pitch.rx*.85,pitch.z],[pitch.x+pitch.rx*.85,pitch.z]],'#899774');
      for (const trail of groundsTrails) line(trail,'#9b8864',1.6);
      line([[-73,-96],[-42,-96],[-42,-133]],'#796946',2.6);
      if (showStation) rect(-48,48,84,140,'#c2b393');
      ctx.fillStyle='#496d6c'; ctx.font='italic 12px Georgia, serif'; ctx.textAlign='center';
      ctx.fillText('黑湖',X(16),Z(-85));
      for (const p of outdoors) {
        if (p.point.z>ext[3]) continue;
        const x=X(p.point.x), z=Z(p.point.z), active=selected===p;
        ctx.fillStyle=active?'#934d32':'#595641'; ctx.beginPath();
        const radius=active?5.2:3.2;
        ctx.moveTo(x,z-radius); ctx.lineTo(x+radius,z); ctx.lineTo(x,z+radius); ctx.lineTo(x-radius,z);ctx.closePath();ctx.fill();
        hits.push({x,z,p,r:Math.max(9,radius*1.7)});
      }
      if (selected?.area==='grounds') {
        ctx.font='600 12px "Songti SC",serif';ctx.textAlign='center';ctx.fillStyle='#573723';
        const x=Math.max(48,Math.min(w-48,X(selected.point.x)));
        ctx.strokeStyle='#eee4c9';ctx.lineWidth=3;ctx.strokeText(selected.name,x,Z(selected.point.z)-9);
        ctx.fillText(selected.name,x,Z(selected.point.z)-9);
      }
    } else {
      for (const s of floor.surfaces) {
        const active=selected?.id===s.roomId;
        rect(s.x1,s.x2,s.z1,s.z2,active?'#d0ad83':s.kind==='room'?'#e0d3af':'#d1c39e');
        if (s.kind==='stairs') for(let z=s.z1+.4;z<s.z2;z+=1) line([[s.x1,z],[s.x2,z]],'#83795b',.65);
      }
      for (const b of floor.walls) line([[b.x1,b.z1],[b.x2,b.z2]],'#635c46',1.6);
      for (const room of floor.rooms) {
        const p=byKey.get('castle/'+room.id), x=X((room.x1+room.x2)/2), z=Z((room.z1+room.z2)/2);
        hits.push({x,z,p,rect:[X(room.x1),X(room.x2),Z(room.z1),Z(room.z2)]});
        if (selected===p) {
          ctx.save();ctx.translate(x,z-4);ctx.rotate(Math.PI/4);ctx.fillStyle='#8d482d';ctx.fillRect(-3,-3,6,6);ctx.restore();
        }
        const pixels=(room.x2-room.x1)*scale-6;
        ctx.textAlign='center';ctx.fillStyle=selected===p?'#613d28':'#5a5844';
        ctx.font='11px "Songti SC", serif';
        let label=room.name;
        while (label.length>2 && ctx.measureText(label).width>pixels) label=label.slice(0,-1);
        if (pixels>20) ctx.fillText(label,x,z+(selected===p?11:3));
      }
    }
    const here=context(), same = outside ? here.area==='grounds' : here.area==='castle' && castleLocation(here.position).level===floor.level;
    if (same) {
      const x=X(here.position.x), z=Z(here.position.z);
      ctx.save();ctx.translate(x,z);ctx.rotate(-here.yaw);ctx.fillStyle='#226d71';ctx.strokeStyle='#f4edda';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(4.7,4.9);ctx.lineTo(0,3.1);ctx.lineTo(-4.7,4.9);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }
    ctx.fillStyle='#6a624c';ctx.textAlign='center';ctx.font='10px Georgia,serif';ctx.fillText('N',w-13,13);
    ctx.beginPath();ctx.moveTo(w-13,16);ctx.lineTo(w-16,26);ctx.lineTo(w-13,24);ctx.lineTo(w-10,26);ctx.closePath();ctx.fill();
    ctx.restore();
  }

  chart.addEventListener('click', e => {
    const r=chart.getBoundingClientRect(), x=e.clientX-r.left,z=e.clientY-r.top;
    const hit=hits.find(h => h.rect ? x>=h.rect[0] && x<=h.rect[1] && z>=h.rect[2] && z<=h.rect[3] : Math.hypot(h.x-x,h.z-z)<=h.r);
    if (hit) { search.value='';populate(hit.p); }
  });
  floorSelect.onchange=() => { search.value='';populate(); };
  search.oninput=() => populate(selected);
  $('openAtlas').onclick=open; $('closeAtlas').onclick=()=>dialog.close();
  $('atlasTravel').onclick=() => { if(selected){dialog.close();onTravel(selected);} };
  $('atlasRestart').onclick=()=>{dialog.close();onRestart();};
  dialog.addEventListener('keydown',e=>{
    if(e.code==='KeyM' && e.target!==search){ e.preventDefault(); if(!e.repeat) dialog.close(); }
    e.stopPropagation();
  });
  dialog.addEventListener('close',()=>{ if(!$('campusHud').hidden) $('openAtlas').focus({preventScroll:true}); });
  new ResizeObserver(draw).observe(chart);
  return {open, locate, visit, getPlace:(area,id)=>byKey.get(area+'/'+id), get isOpen(){return dialog.open;}};
}
