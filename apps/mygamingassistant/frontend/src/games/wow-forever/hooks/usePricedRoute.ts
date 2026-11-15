import { useMemo, useState } from "react";
import type { EnchantSlot } from "@/games/wow-forever/crafting/cheapestRoute";
import { pricedRoute } from "@/games/wow-forever/crafting/pricedRoute";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { useExcludedSlots, useKnownRecipes, usePriceOverrides, type PriceOverrides } from "@/games/wow-forever/hooks/useCraftPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { PricedRouteResult } from "@/games/wow-forever/types/pricedRouteResult";

export interface PricedRouteState extends PricedRouteResult {
  useDefault: boolean;
  setUseDefault: (useDefault: boolean) => void;
  knownFormulas: ReadonlySet<number>;
  setFormula: (spell: number, known: boolean) => void;
  setSlot: (slot: EnchantSlot, allowed: boolean) => void;
  overrides: PriceOverrides;
  /** Null while the auction prices load, or when they failed. */
  auction: AuctionPrices | null;
}

/**
 * Everything the route section needs for prices (see `pricedRoute`), plus the
 * choices you make on the guide: overrides, formulas you bought, slots you
 * can't enchant and "show the default route". Memoized on its inputs, so typing
 * elsewhere on the page doesn't rerun the cheapest-route search.
 */
export function usePricedRoute(profession: CraftingProfession, data: CraftingData, skill: number | null): PricedRouteState {
  const overrides = usePriceOverrides();
  const { prices: auction } = useAuctionPrices();
  const [knownFormulas, setFormula] = useKnownRecipes(profession);
  const [excludedSlots, setSlot] = useExcludedSlots();
  const [useDefault, setUseDefault] = useState(false);
  const start = skill ?? 1;

  const result = useMemo(
    () =>
      pricedRoute({
        profession,
        data,
        start,
        auction,
        overrides: overrides.prices,
        knownFormulas,
        excludedSlots,
        useDefault,
      }),
    [profession, data, start, auction, overrides.prices, knownFormulas, excludedSlots, useDefault],
  );

  return { ...result, useDefault, setUseDefault, knownFormulas, setFormula, setSlot, overrides, auction };
}
