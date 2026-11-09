import { PRICE_FACTION_LABEL } from "@/games/wow-forever/data/priceFactions";
import { PRICE_SERVER_LABEL } from "@/games/wow-forever/data/priceServers";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";

/** Whose auction house, as every price surface names it: "PvP · Alliance". */
export function priceHouseLabel({ server, faction }: PriceHouse): string {
  return `${PRICE_SERVER_LABEL[server]} · ${PRICE_FACTION_LABEL[faction]}`;
}
