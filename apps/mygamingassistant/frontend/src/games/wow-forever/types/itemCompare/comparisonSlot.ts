/** A worn slot an item is compared with. */
export interface ComparisonSlot {
  /** Blizzard's slot name (`CharacterItem.slot`). */
  slot: string;
  /** The candidate is an off-hand item and this is the two-hander it would replace. */
  replacesTwoHander: boolean;
}
