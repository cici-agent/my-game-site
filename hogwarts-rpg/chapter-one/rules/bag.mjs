// Potions stack by type: any positive quantity occupies one ordinary bag slot.
// Equipment, permanent tools, appearances and collections live outside the bag.
export function occupiedBagSlots(characterOrBag) {
  const inventory = characterOrBag?.inventory, potions = characterOrBag?.potions;
  return (Array.isArray(inventory) ? inventory.length : 0)
    + (potions?.health > 0 ? 1 : 0)
    + (potions?.focus > 0 ? 1 : 0);
}
