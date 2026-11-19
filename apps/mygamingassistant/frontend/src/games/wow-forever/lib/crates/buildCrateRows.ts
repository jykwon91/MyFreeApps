import { cheapestBundleIndex } from "@/games/wow-forever/lib/crates/cheapestBundleIndex";
import type { CrateBundleRow } from "@/games/wow-forever/types/crates/crateBundleRow";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";
import type { CratesFile } from "@/games/wow-forever/types/crates/cratesFile";

/**
 * One row per crate. `priceOf` answers an item id's auction price in copper (undefined = no price).
 * A bundle costs count x the material's price; the cheapest priced bundle is picked (the first in game order on a tie).
 * The total is crate + cheapest bundle only when both are known, never a partial sum.
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
    return {
      crate,
      cratePrice,
      bundles,
      cheapest: best === -1 ? null : bundles[best],
      bundleCost,
      total: cratePrice !== null && bundleCost !== null ? cratePrice + bundleCost : null,
    };
  });
}
