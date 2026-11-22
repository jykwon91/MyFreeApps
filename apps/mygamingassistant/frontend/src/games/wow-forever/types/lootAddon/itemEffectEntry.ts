/** One line of `data/lootAddon/itemEffects.json`: what part of an item's effects is worth, in a weight key. */
export interface ItemEffectEntry {
  stat: string;
  value: number;
  note: string;
  /** Worth a lot more against players than its PvE value (control, immunities, damage shields, armor cuts...). */
  pvp?: true;
}
