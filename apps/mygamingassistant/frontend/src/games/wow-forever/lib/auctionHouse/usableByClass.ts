import type { WowClassId } from "@/games/wow-forever/data/classes";
import { levelCap } from "@/games/wow-forever/data/levelCap";
import { canEquip } from "@/games/wow-forever/gear/gearFilters";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/**
 * Can the class ever equip this item (class-restricted gear, armor and weapon
 * proficiencies, shields)? Judged at the level cap, so plate isn't hidden from a
 * level 30 Warrior who will wear it at 40; the required-level filter covers "now".
 */
export function usableByClass(item: ClientItem, classId: WowClassId): boolean {
  const group = { id: item.slot, label: item.slot, slots: [item.slot], note: null };
  return canEquip(item, group, classId, levelCap());
}
