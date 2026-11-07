export const HEROES = [
  { id: 'harry', name: '哈利·波特', english: 'Harry Potter', defaultWand: 'holly',
    description: '黑色乱发下藏着闪电形伤疤，一副细圆眼镜是他的标志。' },
  { id: 'hermione', name: '赫敏·格兰杰', english: 'Hermione Granger', defaultWand: 'vine',
    description: '蓬松的栗色长卷发勾勒出脸庞，棕色双眼专注地望向前方。' },
  { id: 'ron', name: '罗恩·韦斯莱', english: 'Ron Weasley', defaultWand: 'willow',
    description: '一头明亮的红发，鼻梁和两颊散着雀斑，身形比伙伴们更高挑。' },
];

export const OUTFITS = [
  { id: 'robe', name: '学院长袍', english: 'School Robes', description: '披上格兰芬多的长袍，准备走进大礼堂。' },
  { id: 'uniform', name: '课堂制服', english: 'School Uniform', description: '衬衫、学院领带与针织上衣，适合上课的日子。' },
  { id: 'travel', name: '旅行便装', english: 'Travelling Clothes', description: '换上便于行动的日常服装，出发去探索。' },
];

export const WANDS = [
  { id: 'holly', name: '冬青木魔杖', english: 'Holly', description: '冬青木 · 凤凰羽毛杖芯' },
  { id: 'vine', name: '葡萄藤木魔杖', english: 'Vine', description: '葡萄藤木 · 火龙的心弦杖芯' },
  { id: 'willow', name: '柳木魔杖', english: 'Willow', description: '柳木 · 独角兽毛杖芯' },
];

export const LOADOUT_KEY = 'xcn_magic_character_v1';

export function normalizeSelection(value) {
  const hero = HEROES.find(item => item.id === value?.hero) ?? HEROES[0];
  return {
    hero: hero.id,
    outfit: OUTFITS.find(item => item.id === value?.outfit)?.id ?? 'robe',
    wand: WANDS.find(item => item.id === value?.wand)?.id ?? hero.defaultWand,
  };
}

export function readSelection() {
  try {
    const value = JSON.parse(localStorage.getItem(LOADOUT_KEY));
    return HEROES.some(item => item.id === value?.hero) ? normalizeSelection(value) : null;
  } catch {
    return null;
  }
}

export function writeSelection(value) {
  try {
    localStorage.setItem(LOADOUT_KEY, JSON.stringify(normalizeSelection(value)));
    return true;
  } catch {
    return false;
  }
}
