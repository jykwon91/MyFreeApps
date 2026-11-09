import type { PriceServer } from "@/games/wow-forever/types/priceServer";

/**
 * Every server with priced auction houses, mirroring the backend's
 * `PRICE_SERVER_HOUSES` (`app/core/wow_prices.py`, which says how a server
 * gets mapped). Only the PvP server is mapped so far, so no page offers a
 * server choice: a picker is worth showing once this lists two or more.
 */
export const PRICE_SERVERS: readonly PriceServer[] = ["pvp"];

export const DEFAULT_PRICE_SERVER: PriceServer = "pvp";

/** How the credit line names the server: "Prices from Blizzard (PvP · Alliance AH, US)". */
export const PRICE_SERVER_LABEL: Readonly<Record<PriceServer, string>> = {
  pvp: "PvP",
};
