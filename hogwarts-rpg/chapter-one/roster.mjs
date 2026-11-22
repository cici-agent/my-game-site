// Selection policy is separate from the five legacy heroes' frozen rules.
export const SELECTABLE_HERO_IDS = Object.freeze(['harry', 'ron', 'hermione']);

export function isSelectableHero(heroId) {
  return SELECTABLE_HERO_IDS.includes(heroId);
}
