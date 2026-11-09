import { useCallback } from "react";
import { useLiveSearchParams } from "@platform/ui";
import { AUCTION_HOUSE_PARAM } from "@/games/wow-forever/data/auctionHouse/auctionHouseParams";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { priceFactionPlayer, resolveAuctionHouse } from "@/games/wow-forever/prices/priceFaction";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

/**
 * Whose auction house the lookup page shows. Picking Alliance or Horde saves it
 * as your faction (so every priced page follows) and drops `?house=`; Blackwater
 * is kept in `?house=neutral` for this visit only.
 */
export function useAuctionHouseFaction(): [PriceFaction, (next: PriceFaction) => void] {
  const [params, setParams] = useLiveSearchParams();
  const [player, updatePlayer] = usePlayerSettings();
  const house = resolveAuctionHouse(params.get(AUCTION_HOUSE_PARAM), player.faction);
  const choose = useCallback(
    (next: PriceFaction) => {
      const own = priceFactionPlayer(next);
      if (own) updatePlayer({ faction: own });
      setParams(
        (prev) => {
          if (own) prev.delete(AUCTION_HOUSE_PARAM);
          else prev.set(AUCTION_HOUSE_PARAM, next);
          return prev;
        },
        { replace: true },
      );
    },
    [setParams, updatePlayer],
  );
  return [house, choose];
}
