/** Ask's live-data tools (auction prices, server status): honest when data is old, missing or didn't load. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PricesCard from "@/games/wow-forever/components/ask/cards/PricesCard";
import ServerStatusCard from "@/games/wow-forever/components/ask/cards/ServerStatusCard";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_LIVE } from "@/games/wow-forever/data/ask/askLiveStates";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { ASK_TOOL_NOTE } from "@/games/wow-forever/data/ask/askToolNotes";
import { SERVER_STATUS_COPY } from "@/games/wow-forever/data/serverStatus/serverStatusCopy";
import { askPriceMatches } from "@/games/wow-forever/lib/ask/askPriceMatches";
import { runAskTool } from "@/games/wow-forever/lib/ask/runAskTool";
import { mapPriceList } from "@/games/wow-forever/prices/auctionPrices";
import { pricesAreOld } from "@/games/wow-forever/prices/priceFreshness";
import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolName } from "@/games/wow-forever/types/ask/askToolName";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import type { ServerStatusResponse } from "@/games/wow-forever/types/serverStatus/serverStatusResponse";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { priceList, STUB_QUANTITY } from "@/test/auctionPricesStub";
import { askToolData } from "./wowAskWorld";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const TWO_HOURS_AGO = "2026-11-08T10:00:00Z";
const A_DAY_AGO = "2026-11-07T12:00:00Z";

const CLOTH: [number, number, string][] = [
  [2996, 5000, "Bolt of Linen Cloth"],
  [2589, 1200, "Linen Cloth"],
  [4306, 3000, "Silk Cloth"],
];

const RULESETS = [
  { name: "Normal", slug: "normal", online: true },
  { name: "PvP", slug: "pvp", online: false },
  { name: "Roleplay", slug: "roleplay", online: true },
  { name: "Roleplay PvP", slug: "roleplay-pvp", online: true },
];

function status(rulesets = RULESETS): ServerStatusResponse {
  return { region: "us", checked_at: "2026-11-08T11:58:00Z", rulesets };
}

function failed(): Promise<never> {
  return Promise.reject(new Error("502"));
}

function run(name: AskToolName, input: Record<string, unknown>, data: Partial<AskToolData>): Promise<AskToolOutcome> {
  return runAskTool({ type: "tool_use", id: "t", name, input }, askToolData({}, data));
}

function prices(response: PriceListResponse): Partial<AskToolData> {
  return { loadPrices: () => Promise.resolve(response) };
}

function cardOf<K extends AskCard["kind"]>(out: AskToolOutcome, kind: K): Extract<AskCard, { kind: K }> {
  if (out.card?.kind !== kind) throw new Error(`expected a ${kind} card, got ${out.card?.kind}`);
  return out.card as Extract<AskCard, { kind: K }>;
}

function inRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("askPriceMatches", () => {
  it("puts the item named exactly first, then the rest by how many are on sale", () => {
    const list = mapPriceList(priceList(CLOTH));
    const found = askPriceMatches(list.byId.values(), "linen cloth");
    expect(found.items.map((i) => i.name)).toEqual(["Linen Cloth", "Bolt of Linen Cloth"]);
    expect(found.total).toBe(2);
  });
});

describe("pricesAreOld", () => {
  it("is old past 12 hours, or when the age isn't known", () => {
    expect(pricesAreOld(TWO_HOURS_AGO, NOW)).toBe(false);
    expect(pricesAreOld(A_DAY_AGO, NOW)).toBe(true);
    expect(pricesAreOld(null, NOW)).toBe(true);
  });
});

describe("auction_prices", () => {
  it("answers with the figures as formatted, whose auction house, US and how old the prices are", async () => {
    const out = await run(ASK_TOOL.auctionPrices, { query: "Linen Cloth" }, prices(priceList(CLOTH, TWO_HOURS_AGO)));
    expect(out.isError).toBe(false);
    const result = JSON.parse(out.content);
    expect(result.region).toBe("US");
    expect(result.auction_house).toBe("Alliance");
    expect(result.source).toBe(ASK_TOOL_NOTE.pricesSource);
    expect(result.updated).toBe("2 hours ago");
    expect(result.note).toBeNull();
    expect(result.results[0]).toEqual({ name: "Linen Cloth", market_value: "12s", cheapest: "12s", on_sale: STUB_QUANTITY });
    const card = cardOf(out, ASK_CARD.prices);
    expect(card.state).toBe(ASK_LIVE.ready);
    expect(card.faction).toBe("alliance");
    expect(card.rows[0]).toMatchObject({ itemId: 2589, name: "Linen Cloth", price: "12s", onSale: "40 in 5 auctions" });
    expect(card.pageHref).toBe("/wow-forever/auction-house?q=Linen+Cloth&house=alliance");
  });

  it("says when the prices are old", async () => {
    const out = await run(ASK_TOOL.auctionPrices, { query: "silk" }, prices(priceList(CLOTH, A_DAY_AGO)));
    expect(JSON.parse(out.content).note).toBe(ASK_TOOL_NOTE.pricesOld);
  });

  it("asks for the saved faction's house, whatever server status region is saved", async () => {
    const loadPrices = vi.fn((faction: PriceFaction) => Promise.resolve(priceList(CLOTH, TWO_HOURS_AGO, faction)));
    const out = await runAskTool(
      { type: "tool_use", id: "t", name: ASK_TOOL.auctionPrices, input: { query: "silk" } },
      askToolData({ faction: FACTION.horde }, { loadPrices, region: "eu" }),
    );
    expect(loadPrices).toHaveBeenLastCalledWith("horde");
    expect(JSON.parse(out.content)).toMatchObject({ region: "US", auction_house: "Horde" });
    expect(cardOf(out, ASK_CARD.prices).pageHref).toBe("/wow-forever/auction-house?q=silk&house=horde");
  });

  it("asks for the house Claude named instead, Blackwater included", async () => {
    const loadPrices = vi.fn((faction: PriceFaction) => Promise.resolve(priceList(CLOTH, TWO_HOURS_AGO, faction)));
    const out = await run(ASK_TOOL.auctionPrices, { query: "silk", faction: "neutral" }, { loadPrices });
    expect(loadPrices).toHaveBeenLastCalledWith("neutral");
    expect(JSON.parse(out.content).auction_house).toBe("Blackwater");
    expect(cardOf(out, ASK_CARD.prices).faction).toBe("neutral");
  });

  it("with no prices yet, says so and gives no number", async () => {
    const out = await run(ASK_TOOL.auctionPrices, { query: "Linen Cloth" }, prices(priceList([])));
    const result = JSON.parse(out.content);
    expect(result.note).toBe(ASK_TOOL_NOTE.pricesNone);
    expect(result.results).toEqual([]);
    expect(cardOf(out, ASK_CARD.prices).state).toBe(ASK_LIVE.none);
  });

  it("when the prices don't load, returns an error that forbids guessing, and an error card", async () => {
    const out = await run(ASK_TOOL.auctionPrices, { query: "Linen Cloth" }, { loadPrices: failed });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content)).toEqual({ error: ASK_TOOL_NOTE.pricesFailed });
    const card = cardOf(out, ASK_CARD.prices);
    expect(card.state).toBe(ASK_LIVE.error);
    expect(card.sourceUpdatedAt).toBeNull();
  });

  it("an item with no auction price is a no-results card, never a guess", async () => {
    const out = await run(ASK_TOOL.auctionPrices, { query: "Thunderfury" }, prices(priceList(CLOTH)));
    expect(JSON.parse(out.content).note).toBe(ASK_TOOL_NOTE.noPriceMatch);
    expect(cardOf(out, ASK_CARD.noResults).tool).toBe(ASK_TOOL.auctionPrices);
  });

  it("rejects a bad input", async () => {
    for (const input of [{}, { query: "silk", region: "us" }, { query: "silk", realm: "x" }, { query: "silk", faction: "goblin" }]) {
      const out = await run(ASK_TOOL.auctionPrices, input, prices(priceList(CLOTH)));
      expect(out.isError).toBe(true);
      expect(out.card).toBeNull();
    }
  });
});

describe("server_status", () => {
  it("lists each ruleset up or down and when it was checked", async () => {
    const out = await run(ASK_TOOL.serverStatus, {}, { loadServerStatus: () => Promise.resolve(status()) });
    const result = JSON.parse(out.content);
    expect(result).toMatchObject({ region: "Americas", checked: "2 minutes ago", note: null });
    expect(result.rulesets).toContainEqual({ name: "PvP", up: false });
    expect(cardOf(out, ASK_CARD.serverStatus).state).toBe(ASK_LIVE.ready);
  });

  it("when Blizzard can't be reached, never says up or down", async () => {
    const out = await run(ASK_TOOL.serverStatus, { region: "eu" }, { loadServerStatus: failed });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content)).toEqual({ error: ASK_TOOL_NOTE.statusFailed });
    const card = cardOf(out, ASK_CARD.serverStatus);
    expect(card).toMatchObject({ state: ASK_LIVE.error, region: "eu", rulesets: [], checkedAt: null });
  });

  it("says when Blizzard listed no servers", async () => {
    const out = await run(ASK_TOOL.serverStatus, {}, { loadServerStatus: () => Promise.resolve(status([])) });
    expect(JSON.parse(out.content).note).toBe(ASK_TOOL_NOTE.statusNone);
    expect(cardOf(out, ASK_CARD.serverStatus).state).toBe(ASK_LIVE.none);
  });

  it("rejects a bad input", async () => {
    const out = await run(ASK_TOOL.serverStatus, { region: "moon" }, { loadServerStatus: () => Promise.resolve(status()) });
    expect(out.isError).toBe(true);
  });
});

describe("PricesCard", () => {
  it("shows the prices with Blizzard's credit for that house and a link to the Auction house", async () => {
    const out = await run(ASK_TOOL.auctionPrices, { query: "Linen Cloth" }, prices(priceList(CLOTH, TWO_HOURS_AGO)));
    inRouter(<PricesCard card={cardOf(out, ASK_CARD.prices)} />);
    expect(screen.getByRole("region", { name: "Auction prices · Alliance AH" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Linen Cloth" })).toBeTruthy();
    expect(screen.getByText("12s")).toBeTruthy();
    expect(screen.getAllByText("On sale: 40 in 5 auctions").length).toBeGreaterThan(0);
    expect(screen.getByTestId("price-credit").textContent).toBe("Prices from Blizzard (Alliance AH, US) · updated 2 hours ago");
    expect(screen.getByRole("link", { name: "Open the Auction house" }).getAttribute("href")).toBe(
      "/wow-forever/auction-house?q=Linen+Cloth&house=alliance",
    );
  });

  it("warns when the prices are old", async () => {
    const out = await run(ASK_TOOL.auctionPrices, { query: "silk" }, prices(priceList(CLOTH, A_DAY_AGO)));
    inRouter(<PricesCard card={cardOf(out, ASK_CARD.prices)} />);
    expect(screen.getByTestId("price-credit").textContent).toContain("these may be out of date");
  });

  it("says there are no prices yet", async () => {
    const out = await run(ASK_TOOL.auctionPrices, { query: "silk" }, prices(priceList([])));
    inRouter(<PricesCard card={cardOf(out, ASK_CARD.prices)} />);
    expect(screen.getByText(/No Alliance auction prices yet/)).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("says the prices didn't load, with no credit line", async () => {
    const out = await run(ASK_TOOL.auctionPrices, { query: "silk" }, { loadPrices: failed });
    inRouter(<PricesCard card={cardOf(out, ASK_CARD.prices)} />);
    expect(screen.getByText(/Couldn't load the auction prices/)).toBeTruthy();
    expect(screen.queryByTestId("price-credit")).toBeNull();
  });
});

describe("ServerStatusCard", () => {
  it("shows the summary, each ruleset and when it was checked", async () => {
    const out = await run(ASK_TOOL.serverStatus, {}, { loadServerStatus: () => Promise.resolve(status()) });
    inRouter(<ServerStatusCard card={cardOf(out, ASK_CARD.serverStatus)} />);
    expect(screen.getByText("1 of 4 servers offline")).toBeTruthy();
    expect(screen.getByRole("list", { name: SERVER_STATUS_COPY.rulesetsLabel }).children).toHaveLength(4);
    expect(screen.getByText("Checked 2 minutes ago")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Server status" }).getAttribute("href")).toBe("/wow-forever/server-status");
  });

  it("when Blizzard can't be reached, says so and shows no up/down", async () => {
    const out = await run(ASK_TOOL.serverStatus, {}, { loadServerStatus: failed });
    inRouter(<ServerStatusCard card={cardOf(out, ASK_CARD.serverStatus)} />);
    expect(screen.getByText(SERVER_STATUS_COPY.unreachable)).toBeTruthy();
    expect(screen.queryByText(/servers (online|offline)/)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
