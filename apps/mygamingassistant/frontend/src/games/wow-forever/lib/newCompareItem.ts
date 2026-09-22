import type { CompareItem, ItemSource } from "@/games/wow-forever/types/compareItem";

let counter = 0;

/** Stable-enough id for list keys; items never leave the page. */
function nextId(): string {
  counter += 1;
  return `item-${Date.now().toString(36)}-${counter}`;
}

export function newCompareItem(name: string, source: ItemSource = "manual"): CompareItem {
  return {
    id: nextId(),
    name,
    slot: null,
    itemType: null,
    quality: null,
    armor: null,
    weapon: null,
    stats: {},
    unparsedEffects: [],
    requiredLevel: null,
    setName: null,
    source,
    warnings: [],
  };
}
