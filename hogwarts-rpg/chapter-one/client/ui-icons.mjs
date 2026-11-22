const NS = 'http://www.w3.org/2000/svg';
// Small original emblems shared by the spell dock, equipment and inventory.
// Fixed vector paths keep every icon crisp without another asset download.
const symbols = {
 bolt: ['#edb47a', ['M12 34 31 15M11 31l4 4M28 10v6m-3-3h6M36 18v8m-4-4h8M18 8v5m-2.5-2.5h5']],
 feather: ['#a6d9d5', ['M12 37 32 13M17 29c-5-13 8-23 20-21 1 12-4 23-17 24M20 27l-2-10m7 5V12m0 10 10-2M14 38h10']],
 interrupt: ['#9edce6', ['M13 12 21 20m6 8 8 8M35 12l-9 9m-4 6-9 9M17 8h-7v7m21-7h7v7M10 32v7h7m14 0h7v-7M24 17v14m-6-7h12']],
 shield: ['#dfae76', ['M24 7 38 13v11c0 9-14 17-14 17S10 33 10 24V13Z M24 14v19m-7-9 7 9 7-9']],
 focus: ['#b6c8f3', ['M9 24h8l7-14 7 14h8M17 24l7 14 7-14M24 18v12M8 12h5m22 24h5']],
 dodge: ['#abcbdd', ['M27 9c3 0 5 4 2 6-3 1-5-3-2-6M22 18l7 4-3 10 7 6m-7-6-10 7m6-21-5 7h-7M10 14h8M6 32h7']],
 mark: ['#d8cb91', ['M8 24s6-11 16-11 16 11 16 11-6 11-16 11S8 24 8 24Z M24 19a5 5 0 1 0 0 10 5 5 0 0 0 0-10M24 6v5m0 26v5M6 24h4m28 0h4']],
 rescue: ['#b5d4a1', ['M19 8h10v10h10v10H29v11H19V28H9V18h10Z M14 33l-4 4m24-4 4 4']],
 potion: ['#dd9898', ['M19 7h10v5l-2 1v8c6 3 10 7 10 12 0 6-6 8-13 8s-13-2-13-8c0-5 4-9 10-12v-8l-2-1ZM19 16h10M14 30c6-3 14 3 20 0M18 35h3']],
 wand: ['#d7b581', ['M10 37 35 12l3 3-25 25ZM28 19l3 3M17 30l3 3M33 6v4m7 6h4M24 11l2 2']],
 robe: ['#b6bccd', ['M17 8 24 12 31 8l11 14-8 5-3-5v18H17V22l-3 5-8-5ZM17 8l7 12 7-12M24 20v20M18 31h3m6 0h3']],
 gloves: ['#b8c9b1', ['M18 39 10 29c-2-4 2-6 5-3l3 3V12c0-4 5-4 5 0v9V8c0-4 5-4 5 0v13V11c0-4 5-4 5 0v12-6c0-4 5-4 5 0v13l-6 9ZM18 35h16']],
 book: ['#b7c8d7', ['M7 10c7-2 12-1 17 3 5-4 10-5 17-3v27c-8-2-12-1-17 3-5-4-10-5-17-3ZM24 13v27M12 18l7 2m-7 5 7 2m10-7 7-2m-7 9 7-2']],
 lens: ['#a2d8d6', ['M20 9a12 12 0 1 0 0 24 12 12 0 0 0 0-24M29 30l10 10-3 3-10-10M14 17c1-3 4-4 6-4']],
 scarf: ['#d3a49d', ['M12 10c5-4 19-4 24 0v9c-8 4-16 4-24 0ZM17 21v20h9V22M22 11v8M27 9v10M17 32h9m-9 5h9']],
 broom: ['#c6b08e', ['M12 37 34 7M13 27l10 8-7 8-13-10ZM13 27l-3 8m7-5-3 8M31 11l4 3']],
 music: ['#d5c39c', ['M20 33V13l18-5v21M20 19l18-5M20 33c0 7-12 7-12 2s12-8 12-2M38 29c0 7-12 7-12 2s12-8 12-2']],
 chest: ['#c2ac87', ['M8 21h32v19H8ZM8 21v-5c0-9 32-9 32 0v5M5 24h38M21 21v10h6V21M13 30v6m22-6v6']],
 orb: ['#d4bdc9', ['M24 8a16 16 0 1 0 0 32 16 16 0 0 0 0-32M14 16c2-3 5-4 9-4M12 29c8 4 16-6 24-2M16 36h16']],
 key: ['#d5bc7e', ['M19 21a7 7 0 1 1 0-14 7 7 0 0 1 0 14M24 20l15 17m-8-10 4-4m0 9 4-4M12 20 5 16l2 9 8 3M27 13l12-6-2 10-8 3']],
 leaf: ['#afc995', ['M11 38 32 14M15 32C6 14 23 7 38 9c0 16-6 28-23 23M20 27l-3-10m9 4 9-2']],
 roots: ['#c9b494', ['M24 9v15m0-6-8-6m8 7 9-7M24 24l-9 9-5 5m14-14 3 14m-7-10-8-1m15 4 9 6m-21-4 2 8']],
 soil: ['#c5ae85', ['M7 36h34L34 22l-10-6-10 6ZM11 29h7m8-5 5 2m-9 7h7M24 16V9l7-3m-7 8-7-6']],
 card: ['#d3c18b', ['M11 6h26v36H11ZM15 11h18v21H15ZM19 28l5-10 5 10M24 14v3M19 37h10']],
 medal: ['#ddbd7e', ['M15 8h18l-4 14H19ZM24 20a10 10 0 1 0 0 20 10 10 0 0 0 0-20M24 24l2 4 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1Z']],
 bag: ['#c9b88c', ['M15 12c0-8 18-8 18 0M11 14h26l4 25H7ZM16 22h16v12H16ZM21 14v8h6v-8']],
 map: ['#b7c9b1', ['M6 11 18 7l12 4 12-4v30l-12 4-12-4-12 4ZM18 7v30M30 11v30M12 24l3 2m7-5 4-3m8 4 4 3']],
 light: ['#e4d5a3', ['M17 29c-10-11 1-24 11-20 9 4 8 14 3 20ZM18 33h12m-10 5h8M24 1v4m-20 14h5m30 0h5M7 6l4 4m26-4-4 4']],
 decoy: ['#cda3d7', ['M16 9h16l7 13-7 16H16L9 22ZM15 21h7m4 0h7M19 30c4 3 7 3 10 0M24 8v6']],
 herb: ['#accd9d', ['M10 34c1-15 19-21 28-23-1 19-12 26-28 23M12 34l17-15M21 26l-1-10m5 7 11-1']],
 person: ['#dcc5a1', ['M24 7a7 7 0 1 0 0 14 7 7 0 0 0 0-14M10 40v-6c0-13 28-13 28 0v6ZM17 28l7 5 7-5']],
};
const aliases={'ITEM-COLLECT-FIELD-01':'feather','ITEM-COLLECT-FIELD-02':'leaf','ITEM-COLLECT-FIELD-03':'book','ITEM-COLLECT-FIELD-04':'mark','ITEM-TOOL-SKETCHBOARD':'card',bolt:'bolt',levitate:'feather',H1:'interrupt',R1:'shield',M1:'focus',N1:'herb',G1:'decoy',dodge:'dodge',mark:'mark',rescue:'rescue',light:'light',broom:'broom',character:'person',inventory:'bag',skills:'book',map:'map',weapon:'wand',top:'robe',gloves:'gloves'};
function symbolFor(id='') {
 if(aliases[id]) return aliases[id];
 if(/potion|POTION|PASSAGE-DOSE/.test(id))return 'potion';
 if(/WAND/.test(id))return 'wand'; if(/TOP|ROBE/.test(id))return 'robe'; if(/GLOVES/.test(id))return 'gloves';
 if(/SCARF/.test(id))return 'scarf'; if(/LENS/.test(id))return 'lens'; if(/BROOM/.test(id))return 'broom';
 if(/MUSIC/.test(id))return 'music'; if(/CRATE/.test(id))return 'chest'; if(/REMEMBRALL/.test(id))return 'orb';
 if(/KEY/.test(id))return 'key'; if(/LEAF/.test(id))return 'leaf'; if(/SOIL/.test(id))return 'soil'; if(/ROOT/.test(id))return 'roots';
 if(/CARD/.test(id))return 'card'; if(/MEMO/.test(id))return 'medal'; return 'book';
}
export function iconDefinition(id) {
 const key=symbolFor(id),[defaultColor,paths]=symbols[key];
 const color=/focus|FOCUS/.test(id)?'#9acbe9':/health|HEALTH/.test(id)?'#e7a3a6':defaultColor;
 const tier=Number(/-T([123])-/.exec(id)?.[1]??0);
 const details=tier?Array.from({length:tier},(_,i)=>`M${21+i*4-tier*2} 44v-2`):[];
 return {key,color,paths:[...paths,...details]};
}
export function createIcon(doc,id,className='ui-icon') {
 const definition=iconDefinition(id),svg=doc.createElementNS(NS,'svg');
 for(const [key,value] of Object.entries({viewBox:'0 0 48 48',fill:'none',stroke:definition.color,'stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:className}))svg.setAttribute(key,value);
 for(const d of definition.paths){const path=doc.createElementNS(NS,'path');path.setAttribute('d',d);svg.append(path);} return svg;
}
export function iconMarkup(id,className='ui-icon') {
 const {color,paths}=iconDefinition(id),safeClass=String(className).replace(/[^a-zA-Z0-9 _-]/g,'');
 return `<svg class="${safeClass}" viewBox="0 0 48 48" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths.map(d=>`<path d="${d}"/>`).join('')}</svg>`;
}
