import { useMemo, useState } from "react";
import type { EnchantSlot } from "@/games/wow-forever/crafting/cheapestRoute";
import { pricedRoute } from "@/games/wow-forever/crafting/pricedRoute";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { useExcludedSlots, useKnownRecipes, usePriceOverrides, type PriceOverrides } from "@/games/wow-forever/hooks/useCraftPrices";
import { CRAFT_ROUTE_MODE, type CraftRouteMode } from "@/games/wow-forever/types/craftRouteMode";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { PricedRouteResult } from "@/games/wow-forever/types/pricedRouteResult";

export interface PricedRouteState extends PricedRouteResult {
  /** The route you asked for; `shown` (in the result) is the one you got. */
  mode: CraftRouteMode;
  setMode: (mode: CraftRouteMode) => void;
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
 * can't enchant and which route to show. Memoized on its inputs, so typing
 * elsewhere on the page doesn't rerun the cheapest-route search.
 */
export function usePricedRoute(profession: CraftingProfession, data: CraftingData, skill: number | null, spec: string | null): PricedRouteState {
  const overrides = usePriceOverrides();
  const { prices: auction } = useAuctionPrices();
  const [knownFormulas, setFormula] = useKnownRecipes(profession);
  const [excludedSlots, setSlot] = useExcludedSlots();
  const [mode, setMode] = useState<CraftRouteMode>(CRAFT_ROUTE_MODE.cheapest);
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
        mode,
        spec,
      }),
    [profession, data, start, auction, overrides.prices, knownFormulas, excludedSlots, mode, spec],
  );

  return { ...result, mode, setMode, knownFormulas, setFormula, setSlot, overrides, auction };
}
