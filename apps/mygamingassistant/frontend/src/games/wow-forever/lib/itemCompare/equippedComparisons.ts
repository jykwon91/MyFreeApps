import { itemsBySlot } from "@/games/wow-forever/lib/character/characterGear";
import { compareItems } from "@/games/wow-forever/lib/itemCompare/compareItems";
import { comparisonSlots } from "@/games/wow-forever/lib/itemCompare/comparisonSlots";
import { upgradeVerdict } from "@/games/wow-forever/lib/itemCompare/upgradeVerdict";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { EquippedComparison } from "@/games/wow-forever/types/itemCompare/equippedComparison";
import type { ItemDelta } from "@/games/wow-forever/types/itemCompare/itemDelta";
import type { ItemScorer } from "@/games/wow-forever/types/itemCompare/itemScorer";
import type { UpgradeVerdict } from "@/games/wow-forever/types/itemCompare/upgradeVerdict";

/** One worn item before its verdict: its game-file record and delta, or null when its stats are unknown. */
interface Compared {
  worn: CharacterItem;
  replacesTwoHander: boolean;
  known: ClientItem | null;
  delta: ItemDelta | null;
}

function countsOnlyStats(delta: ItemDelta | null): boolean {
  return delta !== null && (delta.otherEffects || delta.damageNotCompared);
}

/**
 * The equipped items `candidate` is compared with, each with what changes. An equipped item the
 * game files can't give fixed stats for (not listed, or a random "of the …" suffix) is returned
 * as unknown rather than guessed; so is every one when the candidate's own stats are unknown.
 * Empty slots are left out.
 *
 * With `score`, known comparisons also say whether the candidate is an upgrade. A two-hander is
 * judged once, on the first block, against both hands together (none if either is unknown); an
 * off-hand item against a worn two-hander gets none, since that swap also needs a main hand.
 */
export function equippedComparisons(
  candidate: ClientItem,
  equipped: readonly CharacterItem[],
  itemsById: ReadonlyMap<number, ClientItem>,
  score: ItemScorer | null = null,
): EquippedComparison[] {
  const bySlot = itemsBySlot(equipped);
  const compared = comparisonSlots(candidate.slot, bySlot).flatMap(({ slot, replacesTwoHander }): Compared[] => {
    const worn = bySlot.get(slot);
    if (!worn) return [];
    const found = itemsById.get(worn.item_id);
    const known = found && !found.randomSuffix && !candidate.randomSuffix ? found : null;
    return [{ worn, replacesTwoHander, known, delta: known ? compareItems(candidate, known) : null }];
  });
  const bothHands = candidate.slot === "two_hand" && compared.length > 1;

  function verdictFor(entry: Compared, index: number): UpgradeVerdict | null {
    if (!score || !entry.known || entry.replacesTwoHander) return null;
    if (!bothHands) return upgradeVerdict(score(candidate), score(entry.known), countsOnlyStats(entry.delta));
    if (index > 0 || compared.some((c) => c.known === null)) return null;
    const wornScore = compared.reduce((sum, c) => sum + (c.known ? score(c.known) : 0), 0);
    return upgradeVerdict(score(candidate), wornScore, compared.some((c) => countsOnlyStats(c.delta)), true);
  }

  return compared.map((entry, index): EquippedComparison => {
    const { worn, replacesTwoHander, known, delta } = entry;
    if (!known || !delta) {
      return { kind: "unknown", equipped: worn, replacesTwoHander, reason: candidate.randomSuffix ? "candidate" : "equipped" };
    }
    return { kind: "known", equipped: worn, replacesTwoHander, delta, verdict: verdictFor(entry, index) };
  });
}
