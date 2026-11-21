/**
 * Per-row upgrade comparisons for the Auction House results table.
 * Pure: no state, no side effects.
 */
import { canWear } from "@/games/wow-forever/gear/gearFilters";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import { equippedComparisons } from "@/games/wow-forever/lib/itemCompare/equippedComparisons";
import { isEquippableSlot } from "@/games/wow-forever/lib/itemCompare/comparisonSlots";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { EquippedComparison } from "@/games/wow-forever/types/itemCompare/equippedComparison";
import type { UpgradeVerdict } from "@/games/wow-forever/types/itemCompare/upgradeVerdict";
import type { VerdictScoring } from "@/games/wow-forever/types/itemCompare/verdictScoring";
import type { AuctionUpgrade } from "@/games/wow-forever/types/auctionHouse/auctionUpgrade";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { SortDirection } from "@/games/wow-forever/types/professionTiers/sortDirection";

/** Numeric score for sorting: bigger = better (biggest upgrade first). Non-finite = no comparison. */
export function upgradeNumericScore(upgrade: AuctionUpgrade | undefined): number {
  if (!upgrade || upgrade.kind !== "verdict" || !upgrade.verdict) return -Infinity;
  const { verdict } = upgrade;
  if (verdict.kind === "same") return 0;
  // pct is positive for upgrades, negative for downgrades (from upgradeVerdict.ts).
  return verdict.pct ?? (verdict.kind === "upgrade" ? 1 : -1);
}

/**
 * Among multiple comparisons (e.g. two rings), pick the one that maximises upgrade potential
 * — i.e. compare against the weaker of the two equipped items.
 * Prefers known comparisons over unknown (can still show the equipped item without a verdict).
 */
function bestComparison(comparisons: readonly EquippedComparison[]): EquippedComparison | null {
  if (comparisons.length === 0) return null;
  if (comparisons.length === 1) return comparisons[0];

  function compScore(c: EquippedComparison): number {
    if (c.kind === "unknown") return -Infinity - 1; // known > unknown
    if (!c.verdict) return -Infinity; // known but unscored: above unknown, below any verdict
    const v: UpgradeVerdict = c.verdict;
    if (v.kind === "same") return 0;
    return v.pct ?? (v.kind === "upgrade" ? 1 : -1);
  }

  return comparisons.reduce((best, current) => (compScore(current) > compScore(best) ? current : best));
}

/**
 * Builds a map of item id → upgrade comparison for every Auction House result row.
 * Items not in the game file database (`itemsById`) are omitted (no entry = can't compare).
 */
export function buildUpgradeMap(
  prices: readonly AuctionPrice[],
  character: CharacterResponse,
  itemsById: ReadonlyMap<number, ClientItem>,
  scoring: VerdictScoring | null,
): Map<number, AuctionUpgrade> {
  const classId = characterClassId(character.class_name);
  const map = new Map<number, AuctionUpgrade>();

  for (const price of prices) {
    const candidate = itemsById.get(price.itemId);
    if (!candidate) continue; // not in game files — omit rather than show "unknown"

    if (!isEquippableSlot(candidate.slot)) {
      map.set(price.itemId, { kind: "not-equippable" });
      continue;
    }

    if (classId && !canWear(candidate, classId, character.level)) {
      map.set(price.itemId, { kind: "cant-use" });
      continue;
    }

    const comparisons = equippedComparisons(
      candidate,
      character.items,
      itemsById,
      scoring?.score ?? null,
    );

    if (comparisons.length === 0) {
      map.set(price.itemId, { kind: "slot-empty" });
      continue;
    }

    const best = bestComparison(comparisons);
    if (!best) {
      map.set(price.itemId, { kind: "slot-empty" });
      continue;
    }

    if (best.kind === "unknown") {
      map.set(price.itemId, { kind: "unknown-stats" });
      continue;
    }

    map.set(price.itemId, {
      kind: "verdict",
      verdict: best.verdict,
      equippedItemId: best.equipped.item_id,
      equippedName: best.equipped.name,
    });
  }

  return map;
}

/** A sorted copy of `items` by upgrade percentage. Non-finite scores (non-gear, can't-use) sort last. */
export function sortByUpgrade(
  items: readonly AuctionPrice[],
  upgradeMap: ReadonlyMap<number, AuctionUpgrade>,
  dir: SortDirection,
): AuctionPrice[] {
  return [...items].sort((a, b) => {
    const aScore = upgradeNumericScore(upgradeMap.get(a.itemId));
    const bScore = upgradeNumericScore(upgradeMap.get(b.itemId));
    // Items with no comparison always last, regardless of direction.
    const aFinite = Number.isFinite(aScore);
    const bFinite = Number.isFinite(bScore);
    if (!aFinite && !bFinite) return a.name.localeCompare(b.name) || a.itemId - b.itemId;
    if (!aFinite) return 1;
    if (!bFinite) return -1;
    const diff = dir === "asc" ? aScore - bScore : bScore - aScore;
    return diff || a.name.localeCompare(b.name) || a.itemId - b.itemId;
  });
}
