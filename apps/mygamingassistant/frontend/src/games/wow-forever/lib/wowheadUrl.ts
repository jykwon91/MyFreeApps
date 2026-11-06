/** Wowhead URL for a WoW Forever item page. */
export function wowheadForeverItemUrl(itemId: number): string {
  return `https://www.wowhead.com/forever/item=${itemId}`;
}

/** Wowhead URL for a WoW Forever spell (recipe) page. */
export function wowheadForeverSpellUrl(spellId: number): string {
  return `https://www.wowhead.com/forever/spell=${spellId}`;
}
