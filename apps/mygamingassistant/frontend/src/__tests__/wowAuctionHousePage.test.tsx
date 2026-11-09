import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import WowAuctionHousePage from "@/games/wow-forever/pages/WowAuctionHousePage";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { REGION_STORAGE_KEY } from "@/games/wow-forever/hooks/useWowRegion";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import { PRICE_COLUMNS, pricesFailed, pricesLoading, pricesReady } from "@/test/auctionPricesStub";

const usePricesQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));

function response(items: PriceListResponse["items"], faction: PriceFaction = "alliance"): PriceListResponse {
  return {
    region: "us",
    faction,
    source_updated_at: items.length ? new Date(Date.now() - 2 * 3_600_000).toISOString() : null,
    fetched_at: null,
    columns: PRICE_COLUMNS,
    items,
  };
}

// [item_id, market_value, min_buyout, quantity, listings, name]
const ITEMS: PriceListResponse["items"] = [
  [2589, 120, 100, 23980, 910, "Linen Cloth"],
  [4306, 5000, 4500, 12, 1, "Silk Cloth"],
  [2592, 800, 790, 300, 40, "Wool Cloth"],
];

/** Each faction answers with its own copy of the list, so a test can see which one was asked for. */
function answerPerFaction(items: PriceListResponse["items"] = ITEMS) {
  usePricesQuery.mockImplementation((faction: PriceFaction) => pricesReady(response(items, faction)));
}

function Search() {
  return <span data-testid="search">{useLocation().search}</span>;
}

function renderPage(path = "/wow-forever/auction-house") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WowAuctionHousePage />
      <Search />
    </MemoryRouter>,
  );
}

function rows() {
  return screen.getAllByTestId("auction-row");
}

function saveFaction(faction: "A" | "H") {
  window.localStorage.setItem(
    PLAYER_SETTINGS_STORAGE_KEY,
    JSON.stringify({ faction, classId: "warlock", zoneId: null, level: null, position: null }),
  );
}

describe("Auction house page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePricesQuery.mockReset();
  });

  it("lists items most on sale first with market value, cheapest listing and supply, and the Blizzard credit", () => {
    answerPerFaction();
    renderPage();
    expect(rows().map((r) => r.firstElementChild?.textContent)).toEqual(["Linen Cloth", "Wool Cloth", "Silk Cloth"]);
    const silk = rows()[2];
    expect(within(silk).getByTestId("auction-market")).toHaveTextContent("50s");
    expect(within(silk).getByTestId("auction-cheapest")).toHaveTextContent("45s");
    expect(within(silk).getByTestId("auction-on-sale")).toHaveTextContent("12 in 1 auction");
    expect(within(silk).queryByRole("link")).toBeNull();
    expect(screen.getByTestId("price-credit")).toHaveTextContent("Prices from Blizzard (Alliance AH, US) · updated 2 hours ago");
  });

  it("uses the saved faction's auction house", () => {
    saveFaction("H");
    answerPerFaction();
    renderPage();
    expect(usePricesQuery).toHaveBeenLastCalledWith("horde");
    expect(screen.getByRole("radio", { name: "Horde" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("price-credit")).toHaveTextContent("(Horde AH, US)");
  });

  it("switching to Horde saves it as your faction; Blackwater stays in the URL only", async () => {
    answerPerFaction();
    renderPage("/wow-forever/auction-house?q=cloth");
    await userEvent.click(screen.getByRole("radio", { name: "Horde" }));
    expect(usePricesQuery).toHaveBeenLastCalledWith("horde");
    expect(JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}").faction).toBe("H");
    expect(screen.getByTestId("search")).toHaveTextContent("?q=cloth");

    await userEvent.click(screen.getByRole("radio", { name: "Blackwater" }));
    expect(usePricesQuery).toHaveBeenLastCalledWith("neutral");
    expect(screen.getByTestId("search")).toHaveTextContent("house=neutral");
    expect(JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}").faction).toBe("H");
    expect(screen.getByTestId("price-credit")).toHaveTextContent("(Blackwater AH, US)");

    await userEvent.click(screen.getByRole("radio", { name: "Alliance" }));
    expect(usePricesQuery).toHaveBeenLastCalledWith("alliance");
    expect(screen.getByTestId("search")).not.toHaveTextContent("house=");
  });

  it("opens on ?house= (an Ask link) without changing the saved faction", () => {
    answerPerFaction();
    renderPage("/wow-forever/auction-house?q=wool&house=neutral");
    expect(usePricesQuery).toHaveBeenLastCalledWith("neutral");
    expect(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it("ignores a ?house= that isn't an auction house", () => {
    answerPerFaction();
    renderPage("/wow-forever/auction-house?house=goblins");
    expect(usePricesQuery).toHaveBeenLastCalledWith("alliance");
  });

  it("filters as you type and keeps the search in the URL", async () => {
    answerPerFaction();
    renderPage();
    await userEvent.type(screen.getByLabelText("Search items"), "silk");
    expect(rows()).toHaveLength(1);
    expect(screen.getByTestId("search")).toHaveTextContent("?q=silk");
  });

  it("has its own empty state for a search with no match", () => {
    answerPerFaction();
    renderPage("/wow-forever/auction-house?q=zzz");
    expect(screen.getByText('No items match "zzz".')).toBeInTheDocument();
  });

  it("re-sorts by price", async () => {
    answerPerFaction();
    renderPage();
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "high");
    expect(rows()[0].firstElementChild).toHaveTextContent("Silk Cloth");
  });

  it("is US only and ignores the saved server status region", () => {
    window.localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify("eu"));
    answerPerFaction();
    renderPage();
    expect(screen.queryByRole("radiogroup", { name: "Region" })).toBeNull();
    expect(usePricesQuery).toHaveBeenLastCalledWith("alliance");
    expect(screen.getByTestId("price-credit")).toHaveTextContent("US)");
  });

  it("says when that auction house has no prices yet", () => {
    answerPerFaction([]);
    renderPage();
    expect(screen.getByText("No Alliance auction prices yet.")).toBeInTheDocument();
    expect(screen.getByTestId("price-credit")).toHaveTextContent("No Alliance auction prices yet.");
    expect(screen.queryByTestId("auction-results")).toBeNull();
  });

  it("warns when the prices are old", () => {
    usePricesQuery.mockReturnValue(pricesReady({ ...response(ITEMS), source_updated_at: "2020-01-01T00:00:00Z" }));
    renderPage();
    expect(screen.getByTestId("price-credit")).toHaveTextContent("these may be out of date");
  });

  it("shows a skeleton while loading", () => {
    usePricesQuery.mockReturnValue(pricesLoading());
    renderPage();
    expect(screen.getByTestId("auction-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/Loading\.\.\./)).toBeNull();
  });

  it("shows one error with a retry", async () => {
    const failed = pricesFailed();
    usePricesQuery.mockReturnValue(failed);
    renderPage();
    expect(screen.getAllByText(/Couldn't load/)).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(failed.refetch).toHaveBeenCalled();
  });
});
