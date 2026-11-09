import { PRICE_FACTIONS } from "@/games/wow-forever/data/priceFactions";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** The auction house a player of this faction uses (the World Map's saved faction). */
export function playerPriceFaction(faction: PlayerFaction): PriceFaction {
  return faction === FACTION.horde ? "horde" : "alliance";
}

export function isPriceFaction(value: unknown): value is PriceFaction {
  return PRICE_FACTIONS.some((faction) => faction === value);
}

/** The player faction whose own auction house this is; null for Blackwater (nobody's). */
export function priceFactionPlayer(faction: PriceFaction): PlayerFaction | null {
  if (faction === "alliance") return FACTION.alliance;
  if (faction === "horde") return FACTION.horde;
  return null;
}

/** A valid `?house=` wins; anything else is the player's own house. */
export function resolveAuctionHouse(raw: string | null, player: PlayerFaction): PriceFaction {
  return isPriceFaction(raw) ? raw : playerPriceFaction(player);
}
