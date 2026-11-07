import { PAIRED_BIS_CARDS, WEAPON_BIS_CARDS } from "@/games/wow-forever/data/bisLists/bisStartingCards";
import { isBisSlotId, type BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import type { BisListItems } from "@/games/wow-forever/types/bisLists/bisListItems";
import type { GearRanking } from "@/games/wow-forever/types/gearRanking";
import type { RankedGearItem } from "@/games/wow-forever/types/rankedGearItem";

function topOf(ranking: GearRanking, groupId: string): readonly RankedGearItem[] {
  return ranking.slots.find((s) => s.group.id === groupId)?.top ?? [];
}

/**
 * A new list's rows from a Best gear ranking: each card's top pick, the top
 * two for rings and trinkets, and for weapons whichever scores more — the
 * best two-hander, or the best main hand plus the best different off hand.
 */
export function startingBisItems(ranking: GearRanking): BisListItems {
  const items: Partial<Record<BisSlotId, number>> = {};
  for (const { group, top } of ranking.slots) {
    const pair = PAIRED_BIS_CARDS[group.id];
    if (pair) {
      top.slice(0, pair.length).forEach((r, i) => (items[pair[i]] = r.item.id));
    } else if (!WEAPON_BIS_CARDS.has(group.id) && isBisSlotId(group.id) && top[0]) {
      // Single-row cards share their id with the row (head, neck, … ranged).
      items[group.id] = top[0].item.id;
    }
  }
  const twoHand = topOf(ranking, "two_hand")[0];
  const mainHand = topOf(ranking, "main_hand")[0];
  const offHand = topOf(ranking, "off_hand").find((r) => r.item.id !== mainHand?.item.id);
  const oneHandScore = (mainHand?.score ?? 0) + (offHand?.score ?? 0);
  if (twoHand && twoHand.score >= oneHandScore) {
    items.two_hand = twoHand.item.id;
  } else {
    if (mainHand) items.main_hand = mainHand.item.id;
    if (offHand) items.off_hand = offHand.item.id;
  }
  return items;
}
