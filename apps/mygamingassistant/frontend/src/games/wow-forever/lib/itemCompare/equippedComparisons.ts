import { itemsBySlot } from "@/games/wow-forever/lib/character/characterGear";
import { compareItems } from "@/games/wow-forever/lib/itemCompare/compareItems";
import { comparisonSlots } from "@/games/wow-forever/lib/itemCompare/comparisonSlots";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { EquippedComparison } from "@/games/wow-forever/types/itemCompare/equippedComparison";

/**
 * The equipped items `candidate` is compared with, each with what changes. An equipped item the
 * game files can't give fixed stats for (not listed, or a random "of the …" suffix) is returned
 * as unknown rather than guessed; so is every one when the candidate's own stats are unknown.
 * Empty slots are left out.
 */
export function equippedComparisons(
  candidate: ClientItem,
  equipped: readonly CharacterItem[],
  itemsById: ReadonlyMap<number, ClientItem>,
): EquippedComparison[] {
  const bySlot = itemsBySlot(equipped);
  return comparisonSlots(candidate.slot, bySlot).flatMap(({ slot, replacesTwoHander }): EquippedComparison[] => {
    const worn = bySlot.get(slot);
    if (!worn) return [];
    if (candidate.randomSuffix) return [{ kind: "unknown", equipped: worn, replacesTwoHander, reason: "candidate" }];
    const known = itemsById.get(worn.item_id);
    if (!known || known.randomSuffix) return [{ kind: "unknown", equipped: worn, replacesTwoHander, reason: "equipped" }];
    return [{ kind: "known", equipped: worn, replacesTwoHander, delta: compareItems(candidate, known) }];
  });
}
