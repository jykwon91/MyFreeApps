import { cheapestBundleIndex } from "@/games/wow-forever/lib/crates/cheapestBundleIndex";
import { CRATE_REFUNDS } from "@/games/wow-forever/data/professions/crates/crateRefunds";
import { costPerReward, crateReward } from "@/games/wow-forever/lib/crates/crateReward";
import type { CrateBundleRow } from "@/games/wow-forever/types/crates/crateBundleRow";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";
import type { CratesFile } from "@/games/wow-forever/types/crates/cratesFile";

/**
 * One row per crate. `priceOf` answers an item id's auction price in copper (undefined = no price).
 * A bundle costs count x the material's price; the cheapest priced bundle is picked (the first in game order on a tie).
 * The total is crate + cheapest bundle - the tier's hand-in refund, only when both prices are known, never a partial sum.
 * It goes below zero when the refund is worth more than the crate and its bundle. The cost per reward is that total over the crate's rewards.
 */
export function buildCrateRows(file: CratesFile, priceOf: (itemId: number) => number | undefined): CrateRow[] {
  return file.crates.map((crate) => {
    const costs = crate.bundles.map((bundle) => {
      const unit = priceOf(bundle.item.id);
      return unit === undefined ? null : unit * bundle.count;
    });
    const best = cheapestBundleIndex(costs);
    const bundles: CrateBundleRow[] = crate.bundles.map((bundle, index) => ({
      bundle,
      unitPrice: priceOf(bundle.item.id) ?? null,
      cost: costs[index],
      cheapest: index === best,
    }));
    const cratePrice = priceOf(crate.id) ?? null;
    const bundleCost = best === -1 ? null : costs[best];
    const refund = CRATE_REFUNDS[crate.tier];
    const total = cratePrice !== null && bundleCost !== null ? cratePrice + bundleCost - refund : null;
    const reward = crateReward(crate);
    return {
      crate,
      cratePrice,
      bundles,
      cheapest: best === -1 ? null : bundles[best],
      bundleCost,
      refund,
      total,
      reward,
      costPerReward: costPerReward(total, reward),
    };
  });
}
