/**
 * What a farm's cloth and leather fetch at the auction house in an hour.
 * The farm data names them but has no item ids, so they're found by name. A
 * name with no auction price gives undefined, never 0.
 */
import { clothPerHour, type GoldFarm } from "@/games/wow-forever/gold/goldFarms";
import { auctionCopperByName } from "@/games/wow-forever/prices/auctionPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";

export function clothAuctionPerHour(farm: GoldFarm, prices: AuctionPrices): number | undefined {
  if (!farm.cloth) return undefined;
  const each = auctionCopperByName(prices, farm.cloth);
  return each === undefined ? undefined : each * clothPerHour(farm);
}

/** One skin per kill, as the vendor value assumes. */
export function skinAuctionPerHour(farm: GoldFarm, prices: AuctionPrices): number | undefined {
  if (!farm.skin) return undefined;
  const each = auctionCopperByName(prices, farm.skin);
  return each === undefined ? undefined : each * farm.killsPerHour;
}
