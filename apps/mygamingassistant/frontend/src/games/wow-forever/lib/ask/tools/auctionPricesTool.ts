/**
 * `auction_prices` — the Auction house page's own price list (`/api/wow/prices`)
 * and search. Claude gets the price only as formatted here, with how old it is;
 * when there are none, or they didn't load, it's told so and never gets a number to guess from.
 */
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_LIVE } from "@/games/wow-forever/data/ask/askLiveStates";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { ASK_TOOL_NOTE } from "@/games/wow-forever/data/ask/askToolNotes";
import { auctionHouseHref } from "@/games/wow-forever/lib/ask/askGuideLinks";
import { askPriceMatches } from "@/games/wow-forever/lib/ask/askPriceMatches";
import { regionLabel } from "@/games/wow-forever/lib/ask/askRegion";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import { itemLabel, priceOrDash, soldPerDayText } from "@/games/wow-forever/prices/auctionFormat";
import { mapPriceList } from "@/games/wow-forever/prices/auctionPrices";
import { pricesAreOld } from "@/games/wow-forever/prices/priceFreshness";
import type { AskPriceRow } from "@/games/wow-forever/types/ask/askPriceRow";
import type { AskPricesCard } from "@/games/wow-forever/types/ask/askPricesCard";
import type { AskPricesInput } from "@/games/wow-forever/types/ask/askPricesInput";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

function priceRow(item: AuctionPrice): AskPriceRow {
  return {
    itemId: item.itemId,
    name: itemLabel(item.name, item.itemId),
    price: priceOrDash(item.marketValue),
    soldPerDay: soldPerDayText(item.soldPerDay),
  };
}

export async function auctionPricesTool(input: AskPricesInput, data: AskToolData): Promise<AskToolOutcome> {
  const region = input.region ?? data.region;
  const card: AskPricesCard = {
    kind: ASK_CARD.prices,
    region,
    query: input.query,
    state: ASK_LIVE.error,
    rows: [],
    total: 0,
    credit: null,
    sourceUpdatedAt: null,
    pageHref: auctionHouseHref(input.query),
  };

  let response: PriceListResponse;
  try {
    response = await data.loadPrices(region);
  } catch {
    return { content: JSON.stringify({ error: ASK_TOOL_NOTE.pricesFailed }), isError: true, card };
  }

  const prices = mapPriceList(response);
  const base = { region: regionLabel(region), source: ASK_TOOL_NOTE.pricesSource };
  const withCredit = { ...card, credit: prices.credit, sourceUpdatedAt: prices.sourceUpdatedAt };
  if (prices.byId.size === 0) {
    return {
      content: JSON.stringify({ ...base, results: [], note: ASK_TOOL_NOTE.pricesNone }),
      isError: false,
      card: { ...withCredit, state: ASK_LIVE.none },
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
      sold_per_day: item.soldPerDay,
    })),
    total: found.total,
  };
  return {
    content: JSON.stringify(result),
    isError: false,
    card: { ...withCredit, state: ASK_LIVE.ready, rows: shown.map(priceRow), total: found.total },
  };
}
