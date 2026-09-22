import { isStatKey, type StatValues } from "@/games/wow-forever/data/statKeys";
import type { ParsedTooltip } from "@/games/wow-forever/parsing/parseTooltipText";
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
  };
}

/** Replace an item's contents with what the local text parser read (keeps its id). */
export function fromParsedText(id: string, parsed: ParsedTooltip): CompareItem {
  return { id, quality: null, source: "text", ...parsed };
}
