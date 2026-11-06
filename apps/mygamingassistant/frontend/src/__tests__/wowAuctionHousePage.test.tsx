import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import WowAuctionHousePage from "@/games/wow-forever/pages/WowAuctionHousePage";
import { REGION_STORAGE_KEY } from "@/games/wow-forever/hooks/useWowRegion";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import { PRICE_COLUMNS, TSM_CREDIT, pricesFailed, pricesLoading, pricesReady } from "@/test/auctionPricesStub";

const usePricesQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));

function response(region: string, items: PriceListResponse["items"]): PriceListResponse {
  return {
    region,
    credit: TSM_CREDIT,
    source_updated_at: items.length ? "2026-11-06T09:00:00Z" : null,
    fetched_at: null,
    columns: PRICE_COLUMNS,
    items,
  };
}

// [item_id, market_value, avg_sale_price, historical, sold_per_day, name]
const US_ITEMS: PriceListResponse["items"] = [
  [2589, 120, 130, 120, 40, "Linen Cloth"],
  [4306, 5000, null, 5000, 12.34, "Silk Cloth"],
  [2592, 800, 790, 800, 5, "Wool Cloth"],
];

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

describe("Auction house page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePricesQuery.mockReset();
  });

  it("lists items most traded first with prices, a dash for no average, and the credit", () => {
    usePricesQuery.mockReturnValue(pricesReady(response("us", US_ITEMS)));
    renderPage();
    expect(rows().map((r) => r.firstElementChild?.textContent)).toEqual(["Linen Cloth", "Silk Cloth", "Wool Cloth"]);
    const silk = rows()[1];
    expect(within(silk).getByTestId("auction-market")).toHaveTextContent("50s");
    expect(within(silk).getByTestId("auction-avg")).toHaveTextContent("—");
    expect(within(silk).getByTestId("auction-sold")).toHaveTextContent("12");
    expect(within(silk).queryByRole("link")).toBeNull();
    expect(screen.getByTestId("price-credit")).toHaveTextContent("Prices from TradeSkillMaster");
  });

  it("filters as you type and keeps the search in the URL", async () => {
    usePricesQuery.mockReturnValue(pricesReady(response("us", US_ITEMS)));
    renderPage();
    await userEvent.type(screen.getByLabelText("Search items"), "silk");
    expect(rows()).toHaveLength(1);
    expect(screen.getByTestId("search")).toHaveTextContent("?q=silk");
  });

  it("starts from ?q=", () => {
    usePricesQuery.mockReturnValue(pricesReady(response("us", US_ITEMS)));
    renderPage("/wow-forever/auction-house?q=wool");
    expect(screen.getByLabelText("Search items")).toHaveValue("wool");
    expect(rows()).toHaveLength(1);
  });

  it("has its own empty state for a search with no match", () => {
    usePricesQuery.mockReturnValue(pricesReady(response("us", US_ITEMS)));
    renderPage("/wow-forever/auction-house?q=zzz");
    expect(screen.getByText('No items match "zzz".')).toBeInTheDocument();
  });

  it("re-sorts by name", async () => {
    usePricesQuery.mockReturnValue(pricesReady(response("us", US_ITEMS)));
    renderPage();
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "high");
    expect(rows()[0].firstElementChild).toHaveTextContent("Silk Cloth");
  });

  it("switches region and asks for that region's prices", async () => {
    usePricesQuery.mockReturnValue(pricesReady(response("us", US_ITEMS)));
    renderPage();
    await userEvent.click(screen.getByRole("radio", { name: "EU" }));
    expect(window.localStorage.getItem(REGION_STORAGE_KEY)).toContain("eu");
    expect(usePricesQuery).toHaveBeenLastCalledWith("eu");
  });

  it("says a region with no prices has none", () => {
    window.localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify("kr"));
    usePricesQuery.mockReturnValue(pricesReady(response("kr", [])));
    renderPage();
    expect(screen.getByText("No auction prices for this region yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("auction-results")).toBeNull();
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
