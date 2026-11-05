import { isStatKey, type StatValues } from "@/games/wow-forever/data/statKeys";
import type { ParsedTooltip } from "@/games/wow-forever/parsing/parseTooltipText";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";
import type { ItemExtractionResponse } from "@/games/wow-forever/types/extractionResponse";

/** Replace an item's contents with what the screenshot reader returned (keeps its id). */
export function fromExtraction(id: string, response: ItemExtractionResponse): CompareItem {
  const { item, warnings } = response;
  const stats: StatValues = {};
  for (const [key, value] of Object.entries(item.stats)) {
    if (isStatKey(key)) stats[key] = value;
  }
  let weapon: CompareItem["weapon"] = null;
  if (item.weapon) {
    weapon = { minDamage: item.weapon.min_damage, maxDamage: item.weapon.max_damage, speed: item.weapon.speed };
  }
  return {
    id,
    name: item.name,
    slot: item.slot,
    itemType: item.item_type,
    quality: item.quality,
    armor: item.armor,
    weapon,
    stats,
    unparsedEffects: item.unparsed_effects,
    requiredLevel: item.required_level,
    setName: item.set_name,
    source: "screenshot",
    warnings,
    origin: null,
  };
}

/** What the card says about numbers the game files don't give. */
function clientItemNotes(record: ClientItem): string[] {
  const notes: string[] = [];
  if (record.randomSuffix) notes.push("Stats vary by suffix — enter the numbers from your tooltip.");
  if (record.damageUnknown) {
    notes.push("The game files don't give this weapon's damage — enter it from your tooltip.");
  }
  if (record.otherEffects > 0) {
    const count = record.otherEffects === 1 ? "1 other effect" : `${record.otherEffects} other effects`;
    notes.push(`This item has ${count} the compare page can't score. Check your tooltip.`);
  }
  return notes;
}

/** Replace an item's contents with an item picked from the game files (keeps its id). */
export function fromClientData(id: string, record: ClientItem, clientBuild: string): CompareItem {
  const stats: StatValues = { ...record.stats };
  const weapon = record.weapon ? { ...record.weapon } : null;
  return {
    id,
    name: record.name,
    slot: record.slot,
    itemType: record.itemType,
    quality: record.quality,
    armor: record.armor,
    weapon,
    stats,
    unparsedEffects: [],
    requiredLevel: record.requiredLevel > 0 ? record.requiredLevel : null,
    setName: null,
    source: "database",
    warnings: clientItemNotes(record),
    origin: { itemId: record.id, clientBuild, baseline: { armor: record.armor, weapon, stats } },
  };
}

/** Replace an item's contents with what the local text parser read (keeps its id). */
export function fromParsedText(id: string, parsed: ParsedTooltip): CompareItem {
  return { id, quality: null, source: "text", origin: null, ...parsed };
}
