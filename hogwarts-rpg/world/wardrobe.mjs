import {FITTED_TOPS, FITTED_WANDS} from './fitted-catalog.mjs';

// Equipment IDs are stable across the atelier, saved looks, and the game.
export const SLOT_LABELS = Object.freeze({
  top: '上衣', pants: '裤子', gloves: '手套', shoes: '鞋子', weapon: '手持物', hat: '帽子'
});

export const ITEMS = {
  top: [
    {id:'shirt', name:'新生衬衫', color:'#e1d7bb'},
    {id:'robe', name:'学院长袍', color:'#293643'},
    {id:'jumper', name:'韦斯莱毛衣', color:'#91474b'},
    {id:'vest', name:'学院针织背心', color:'#586376'},
    {id:'fieldcoat', name:'草药学外套', color:'#53705d'},
    ...FITTED_TOPS
  ],
  pants: [
    {id:'trousers', name:'学院长裤', color:'#424956'},
    {id:'corduroy', name:'灯芯绒长裤', color:'#90694a'},
    {id:'breeches', name:'魁地奇马裤', color:'#c4ad89'}
  ],
  gloves: [
    {id:'none', name:'空手', color:'#ae8c75'},
    {id:'garden', name:'龙皮园艺手套', color:'#bd8b49'},
    {id:'keepers', name:'守门员护手', color:'#795345'},
    {id:'mittens', name:'条纹针织手套', color:'#883e4d'}
  ],
  shoes: [
    {id:'oxfords', name:'学院皮鞋', color:'#3d3333'},
    {id:'boots', name:'系扣长靴', color:'#6e4d3b'},
    {id:'sneakers', name:'帆布便鞋', color:'#9c7660'}
  ],
  weapon: [
    {id:'none', name:'不持道具', color:'#9c9586'},
    {id:'holly', name:'冬青木魔杖', color:'#886447'},
    {id:'willow', name:'柳木魔杖', color:'#c09265'},
    {id:'vine', name:'葡萄藤魔杖', color:'#865741'},
    {id:'staff', name:'星辉法杖', color:'#69b9b3'},
    ...FITTED_WANDS
  ],
  hat: [
    {id:'none', name:'不戴帽子', color:'#9c9586'},
    {id:'pointed', name:'尖顶巫师帽', color:'#51445d'},
    {id:'beret', name:'羊毛贝雷帽', color:'#486456'},
    {id:'bobble', name:'绒球针织帽', color:'#90414c'}
  ]
};

const defaults = {
  base: {top:'shirt', pants:'trousers', gloves:'none', shoes:'sneakers', weapon:'none', hat:'none'},
  harry: {top:'robe', pants:'trousers', gloves:'none', shoes:'oxfords', weapon:'holly', hat:'none'},
  ron: {top:'jumper', pants:'corduroy', gloves:'none', shoes:'sneakers', weapon:'willow', hat:'none'},
  hermione: {top:'vest', pants:'trousers', gloves:'none', shoes:'boots', weapon:'vine', hat:'none'},
  neville: {top:'fieldcoat', pants:'corduroy', gloves:'none', shoes:'boots', weapon:'neville.weapon.01', hat:'none'},
  george: {top:'george.top.01', pants:'trousers', gloves:'none', shoes:'sneakers', weapon:'george.weapon.01', hat:'none'}
};
const validIds = Object.fromEntries(Object.entries(ITEMS).map(([slot,items])=>[slot,new Set(items.map(item=>item.id))]));
export const supportsWardrobe = variant => Object.hasOwn(defaults,variant);
export const equipmentStorageKey = variant => `hogwarts.wardrobe.v1.${variant}`;

export function normalizeEquipment(variant, equipment) {
  const outfit = {...(supportsWardrobe(variant) ? defaults[variant] : defaults.base)};
  for (const slot of Object.keys(SLOT_LABELS)) {
    const id = equipment?.[slot];
    if (validIds[slot].has(id)) outfit[slot] = id;
  }
  return outfit;
}

export function loadEquipment(variant) {
  if (supportsWardrobe(variant)) {
    try {
      return normalizeEquipment(variant,JSON.parse(globalThis.localStorage.getItem(equipmentStorageKey(variant))));
    } catch { /* A missing storage API, blocked storage, or an invalid save falls back to this character's outfit. */ }
  }
  return normalizeEquipment(variant);
}

export function saveEquipment(variant,equipment) {
  if (!supportsWardrobe(variant)) return false;
  try {
    globalThis.localStorage.setItem(equipmentStorageKey(variant),JSON.stringify(normalizeEquipment(variant,equipment)));
    return true;
  } catch { return false; }
}
