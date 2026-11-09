/**
 * `auction_prices` — the Auction house page's own price list (`/api/wow/prices`)
 * and search, on one auction house: the PvP server's house for the player's
 * faction unless Claude named another faction or server.
 * Claude gets the price only as formatted here, with whose house it is and how
 * old it is; when there are none, or they didn't load, it's told so and never
 * gets a number to guess from.
 */
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_LIVE } from "@/games/wow-forever/data/ask/askLiveStates";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { ASK_TOOL_NOTE } from "@/games/wow-forever/data/ask/askToolNotes";
import { AUCTION_PRICE_REGION_LABEL } from "@/games/wow-forever/data/priceFactions";
import { DEFAULT_PRICE_SERVER } from "@/games/wow-forever/data/priceServers";
import { auctionHouseHref } from "@/games/wow-forever/lib/ask/askGuideLinks";
import { askPriceMatches } from "@/games/wow-forever/lib/ask/askPriceMatches";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import { itemLabel, onSaleText, priceOrDash } from "@/games/wow-forever/prices/auctionFormat";
import { mapPriceList } from "@/games/wow-forever/prices/auctionPrices";
import { playerPriceFaction } from "@/games/wow-forever/prices/priceFaction";
import { pricesAreOld } from "@/games/wow-forever/prices/priceFreshness";
import { priceHouseLabel } from "@/games/wow-forever/prices/priceHouseLabel";
import type { AskPriceRow } from "@/games/wow-forever/types/ask/askPriceRow";
import type { AskPricesCard } from "@/games/wow-forever/types/ask/askPricesCard";
import type { AskPricesInput } from "@/games/wow-forever/types/ask/askPricesInput";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

function priceRow(item: AuctionPrice): AskPriceRow {
  return {
    itemId: item.itemId,
    name: itemLabel(item.name, item.itemId),
    price: priceOrDash(item.marketValue),
    onSale: onSaleText(item.quantity, item.listings),
  };
}

export async function auctionPricesTool(input: AskPricesInput, data: AskToolData): Promise<AskToolOutcome> {
  const house: PriceHouse = {
    server: input.server ?? DEFAULT_PRICE_SERVER,
    faction: input.faction ?? playerPriceFaction(data.player.faction),
  };
  const card: AskPricesCard = {
    kind: ASK_CARD.prices,
    query: input.query,
    state: ASK_LIVE.error,
    house,
    rows: [],
    total: 0,
    sourceUpdatedAt: null,
    pageHref: auctionHouseHref(input.query, house.faction),
  };

  let response: PriceListResponse;
  try {
    response = await data.loadPrices(house);
  } catch {
    return { content: JSON.stringify({ error: ASK_TOOL_NOTE.pricesFailed }), isError: true, card };
  }

  const prices = mapPriceList(response);
  const base = {
    region: AUCTION_PRICE_REGION_LABEL,
    auction_house: priceHouseLabel(house),
    source: ASK_TOOL_NOTE.pricesSource,
  };
  const dated = { ...card, sourceUpdatedAt: prices.sourceUpdatedAt };
  if (prices.byId.size === 0) {
    return {
      content: JSON.stringify({ ...base, results: [], note: ASK_TOOL_NOTE.pricesNone }),
      isError: false,
      card: { ...dated, state: ASK_LIVE.none },
    };
  }

  const found = askPriceMatches(prices.byId.values(), input.query);
  if (found.total === 0) {
    return {
      content: JSON.stringify({ ...base, results: [], note: ASK_TOOL_NOTE.noPriceMatch }),
      isError: false,
      card: { kind: ASK_CARD.noResults, tool: ASK_TOOL.auctionPrices, query: input.query },
    };
  }

  const shown = found.items.slice(0, Math.min(input.limit, ASK_LIMITS.cardRows));
  const old = pricesAreOld(prices.sourceUpdatedAt, Date.now());
  const result = {
    ...base,
    updated: prices.sourceUpdatedAt ? relativeTime(prices.sourceUpdatedAt) : ASK_TOOL_NOTE.updatedUnknown,
    note: old ? ASK_TOOL_NOTE.pricesOld : null,
    results: shown.map((item) => ({
      name: itemLabel(item.name, item.itemId),
      market_value: priceOrDash(item.marketValue),
      cheapest: priceOrDash(item.minBuyout),
      on_sale: item.quantity,
    })),
    total: found.total,
  };
  return {
    content: JSON.stringify(result),
    isError: false,
    card: { ...dated, state: ASK_LIVE.ready, rows: shown.map(priceRow), total: found.total },
  };
}
