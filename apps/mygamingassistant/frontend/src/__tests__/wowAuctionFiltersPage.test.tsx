import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import AuctionResults from "@/games/wow-forever/components/auctionHouse/AuctionResults";
import WowAuctionHousePage from "@/games/wow-forever/pages/WowAuctionHousePage";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import { PRICE_COLUMNS, pricesReady } from "@/test/auctionPricesStub";

const usePricesQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));

const loadClientItems = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/lib/clientItemsLoader", () => ({ loadClientItems }));

const G = 10_000;
const HELM = 9394; // a rare plate helm in the real icon map
const SHARD = 14344; // Large Brilliant Shard: rare
const GOLD_BAR = 3577; // uncommon

// [item_id, market_value, min_buyout, quantity, listings, name]
const ITEMS: PriceListResponse["items"] = [
  [2589, 120, 100, 23980, 910, "Linen Cloth"],
  [2592, 800, 790, 300, 40, "Wool Cloth"],
  [GOLD_BAR, 3 * G, 3 * G, 80, 9, "Gold Bar"],
  [SHARD, 25 * G, 20 * G, 4, 2, "Large Brilliant Shard"],
  [HELM, 40 * G, 38 * G, 2, 1, "Test Helm"],
  [99999999, 700, 650, 5, 5, "No Icon Item"],
];

function respond(items: PriceListResponse["items"], updatedAt = new Date(Date.now() - 3_600_000).toISOString()) {
  const data: PriceListResponse = {
    region: "us",
    server: "pvp",
    faction: "alliance",
    source_updated_at: updatedAt,
    fetched_at: null,
    columns: PRICE_COLUMNS,
    items,
  };
  usePricesQuery.mockReturnValue(pricesReady(data));
}

function Where() {
  const { search } = useLocation();
  return <span data-testid="search">{search}</span>;
}

function renderPage(path = "/wow-forever/auction-house") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WowAuctionHousePage />
      <Where />
    </MemoryRouter>,
  );
}

const names = () => screen.queryAllByTestId("auction-item-name").map((n) => n.textContent);
const url = () => screen.getByTestId("search").textContent ?? "";

function gearItem(id: number, over: Partial<ClientItem>): ClientItem {
  return {
    id,
    name: "Test Helm",
    quality: "rare",
    slot: "head",
    itemType: "Plate",
    itemLevel: 30,
    requiredLevel: 40,
    armor: 100,
    weapon: null,
    stats: {},
    classes: null,
    damageUnknown: false,
    otherEffects: 0,
    randomSuffix: false,
    ...over,
  };
}

const GEAR_LIST = { byId: new Map([[HELM, gearItem(HELM, {})]]) } as unknown as ClientItemList;

async function openFilters() {
  await userEvent.click(screen.getByTestId("auction-filters-button"));
  return screen.findByRole("dialog", { name: "Filters" });
}

beforeEach(() => {
  window.localStorage.clear();
  usePricesQuery.mockReset();
  loadClientItems.mockReset();
  respond(ITEMS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Auction house filters on a phone", () => {
  it("shows a Filters button with no badge until a filter is on", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /^Filters/ })).toBeInTheDocument();
    expect(screen.queryByTestId("auction-filters-count")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a bottom sheet; a quality chip filters the list and the URL, Apply shows the count and closes it", async () => {
    renderPage();
    const sheet = await openFilters();
    await userEvent.click(within(sheet).getByRole("button", { name: "Rare" }));
    expect(url()).toBe("?quality=rare");
    expect(names()).toEqual(["Large Brilliant Shard", "Test Helm"]);
    expect(within(sheet).getByRole("button", { name: "Rare" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("button", { name: "Apply · 2 items" })).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole("button", { name: /^Apply/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("auction-filters-button")).toHaveFocus());
    expect(screen.getByTestId("auction-filters-count")).toHaveTextContent("1");
  });

  it("closes on Escape and hands focus back to the Filters button", async () => {
    renderPage();
    await openFilters();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("auction-filters-button")).toHaveFocus());
  });

  it("filters by price range in gold", async () => {
    renderPage();
    const sheet = await openFilters();
    await userEvent.type(within(sheet).getByLabelText("From gold"), "10");
    expect(url()).toBe("?min=10");
    expect(names()).toEqual(["Large Brilliant Shard", "Test Helm"]);
    await userEvent.type(within(sheet).getByLabelText("To gold"), "30");
    expect(url()).toBe("?min=10&max=30");
    expect(names()).toEqual(["Large Brilliant Shard"]);
  });

  it("filters by units on sale and by listings, and a second press clears the choice", async () => {
    renderPage();
    const sheet = await openFilters();
    await userEvent.click(within(within(sheet).getByTestId("auction-filter-quantity")).getByRole("button", { name: "100+" }));
    expect(url()).toBe("?qty=100");
    expect(names()).toEqual(["Linen Cloth", "Wool Cloth"]);
    await userEvent.click(within(within(sheet).getByTestId("auction-filter-listings")).getByRole("button", { name: "20+" }));
    expect(url()).toBe("?qty=100&listings=20");
    await userEvent.click(within(within(sheet).getByTestId("auction-filter-quantity")).getByRole("button", { name: "100+" }));
    expect(url()).toBe("?listings=20");
    expect(names()).toEqual(["Linen Cloth", "Wool Cloth"]);
  });

  it("lists active filters as removable chips that are at least 44px tall", async () => {
    renderPage("/wow-forever/auction-house?quality=rare,epic&min=5");
    const chips = within(screen.getByTestId("auction-active-filters"));
    expect(chips.getByRole("button", { name: "Remove filter: Quality: Rare, Epic" })).toHaveClass("min-h-[44px]");
    expect(screen.getByTestId("auction-filters-count")).toHaveTextContent("2");
    await userEvent.click(chips.getByRole("button", { name: "Remove filter: Price: at least 5g" }));
    expect(url()).toBe("?quality=rare%2Cepic");
    await userEvent.click(chips.getByRole("button", { name: "Remove filter: Quality: Rare, Epic" }));
    expect(url()).toBe("");
    expect(screen.queryByTestId("auction-active-filters")).toBeNull();
  });

  it("opens on a link with filters already applied, with the matching chips pressed", async () => {
    renderPage("/wow-forever/auction-house?quality=uncommon,rare&min=2&sort=high");
    expect(names()).toEqual(["Test Helm", "Large Brilliant Shard", "Gold Bar"]);
    expect(screen.getByLabelText("Sort by")).toHaveValue("high");
    const sheet = await openFilters();
    expect(within(sheet).getByRole("button", { name: "Uncommon" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("button", { name: "Epic" })).toHaveAttribute("aria-pressed", "false");
    expect(within(sheet).getByLabelText("From gold")).toHaveValue(2);
  });

  it("ignores values in a link that are not allowed", () => {
    renderPage("/wow-forever/auction-house?quality=mythic&qty=7&slot=hat&sort=chaos&min=-1");
    expect(names()).toHaveLength(ITEMS.length);
    expect(screen.queryByTestId("auction-active-filters")).toBeNull();
  });

  it("keeps the search, house and profession params when filters change", async () => {
    renderPage("/wow-forever/auction-house?q=cloth&house=neutral");
    const sheet = await openFilters();
    await userEvent.click(within(sheet).getByRole("button", { name: "Common" }));
    expect(url()).toBe("?q=cloth&house=neutral&quality=common");
    expect(names()).toEqual(["Linen Cloth", "Wool Cloth"]);
  });

  it("sorts by most listings, biggest gap and highest quality, and keeps the order in the URL", async () => {
    renderPage();
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "listings");
    expect(url()).toBe("?sort=listings");
    expect(names()[0]).toBe("Linen Cloth");
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "gap");
    expect(names().slice(0, 2)).toEqual(["Large Brilliant Shard", "Test Helm"]);
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "quality");
    expect(names().slice(0, 2)).toEqual(["Large Brilliant Shard", "Test Helm"]);
    expect(names()[names().length - 1]).toBe("No Icon Item");
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "supply");
    expect(url()).toBe("");
  });

  it("changing a filter never swaps the list for a skeleton", async () => {
    renderPage();
    const sheet = await openFilters();
    await userEvent.click(within(sheet).getByRole("button", { name: "Epic" }));
    expect(screen.queryByTestId("auction-skeleton")).toBeNull();
    expect(screen.getByTestId("auction-empty")).toBeInTheDocument();
  });
});

describe("Auction house list: empty and paging", () => {
  it("names the filters when nothing matches and clears them, keeping the search", async () => {
    renderPage("/wow-forever/auction-house?q=cloth&quality=epic&min=10");
    expect(screen.getByTestId("auction-empty")).toHaveTextContent(
      'No items match "cloth" with these filters: Quality: Epic; Price: at least 10g.',
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(url()).toBe("?q=cloth");
    expect(names()).toEqual(["Linen Cloth", "Wool Cloth"]);
  });

  it("has no Clear filters button when only a search matches nothing", () => {
    renderPage("/wow-forever/auction-house?q=zzz");
    expect(screen.getByText('No items match "zzz".')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("says how many items match and pages 50 at a time", async () => {
    respond(Array.from({ length: 120 }, (_, i) => [1000 + i, 100 + i, 100 + i, 10, 2, `Thing ${String(i).padStart(3, "0")}`]));
    renderPage("/wow-forever/auction-house?sort=name");
    expect(screen.getByTestId("auction-results-note")).toHaveTextContent("120 items · showing the first 50");
    expect(names()).toHaveLength(50);
    await userEvent.click(screen.getByTestId("auction-show-more"));
    expect(names()).toHaveLength(100);
    expect(screen.getByTestId("auction-show-more")).toHaveTextContent("Show 20 more (20 left)");
    await userEvent.click(screen.getByTestId("auction-show-more"));
    expect(names()).toHaveLength(120);
    expect(screen.queryByTestId("auction-show-more")).toBeNull();
    expect(screen.getByTestId("auction-results-note")).toHaveTextContent("120 items");
  });

  it("says 'match' once a filter narrows the list, and starts paging over", async () => {
    respond(Array.from({ length: 120 }, (_, i) => [1000 + i, 100 + i, 100 + i, 10, 2, `Thing ${String(i).padStart(3, "0")}`]));
    renderPage();
    await userEvent.click(screen.getByTestId("auction-show-more"));
    expect(names()).toHaveLength(100);
    await userEvent.type(screen.getByLabelText("Search items"), "Thing 0");
    expect(screen.getByTestId("auction-results-note")).toHaveTextContent("100 items match");
    expect(names()).toHaveLength(50);
  });

  it("keeps the shown rows when prices refetch, and starts over for a new view", async () => {
    const things = (bump: number): AuctionPrice[] =>
      Array.from({ length: 120 }, (_, i) => ({ itemId: 1000 + i, name: `Thing ${i}`, marketValue: 100 + i + bump, minBuyout: 100, quantity: 10, listings: 2 }));
    const list = (items: AuctionPrice[], key: string) => (
      <MemoryRouter>
        <AuctionResults items={items} resultsKey={key} bisPicks={null} note={() => null} />
      </MemoryRouter>
    );
    const view = render(list(things(0), "a"));
    await userEvent.click(screen.getByTestId("auction-show-more"));
    expect(names()).toHaveLength(100);
    view.rerender(list(things(1), "a"));
    expect(names()).toHaveLength(100);
    view.rerender(list(things(1), "b"));
    expect(names()).toHaveLength(50);
  });

  it("still shows a dash for a price it does not have", () => {
    respond([[2589, 0, 0, 0, 0, "Linen Cloth"]]);
    renderPage();
    expect(screen.getByTestId("auction-market")).toBeInTheDocument();
  });
});

describe("Auction house gear filters", () => {
  it("do not load the game's item list until the Gear group is opened", async () => {
    loadClientItems.mockResolvedValue(GEAR_LIST);
    renderPage();
    const sheet = await openFilters();
    expect(loadClientItems).not.toHaveBeenCalled();
    await userEvent.click(within(sheet).getByRole("button", { name: /Gear filters/ }));
    expect(loadClientItems).toHaveBeenCalledTimes(1);
    expect(await within(sheet).findByRole("button", { name: "Plate" })).toBeInTheDocument();
  });

  it("show skeleton chips while the list loads, then filter by type, slot and level", async () => {
    let finish: (list: ClientItemList) => void = () => undefined;
    loadClientItems.mockReturnValue(new Promise<ClientItemList>((resolve) => (finish = resolve)));
    renderPage();
    const sheet = await openFilters();
    await userEvent.click(within(sheet).getByRole("button", { name: /Gear filters/ }));
    expect(within(sheet).getByTestId("auction-gear-skeleton")).toBeInTheDocument();
    await act(async () => finish(GEAR_LIST));
    await userEvent.click(await within(sheet).findByRole("button", { name: "Plate" }));
    expect(url()).toBe("?type=Plate");
    expect(names()).toEqual(["Test Helm"]);
    await userEvent.click(within(sheet).getByRole("button", { name: "Head" }));
    expect(url()).toBe("?type=Plate&slot=head");
    await userEvent.type(within(sheet).getByLabelText("From level"), "41");
    expect(names()).toEqual([]);
    expect(screen.getByTestId("auction-empty")).toHaveTextContent("Slot: Head; Type: Plate; Level: at least 41");
  });

  it("pulls a level typed past the cap back to the cap, and rounds a decimal level without clearing the other box", async () => {
    loadClientItems.mockResolvedValue(GEAR_LIST);
    renderPage();
    const sheet = await openFilters();
    await userEvent.click(within(sheet).getByRole("button", { name: /Gear filters/ }));
    await userEvent.type(await within(sheet).findByLabelText("To level"), "75");
    expect(url()).toBe("?lvl=-60");
    expect(within(sheet).getByLabelText("To level")).toHaveValue(60);
    await userEvent.type(within(sheet).getByLabelText("From level"), "5.5");
    expect(url()).toBe("?lvl=6-60");
    expect(within(sheet).getByLabelText("To level")).toHaveValue(60);
  });

  it("picks whose gear to show on the page, marking the saved class, and Any class clears it", async () => {
    loadClientItems.mockResolvedValue(GEAR_LIST);
    renderPage();
    const select = await screen.findByLabelText("Gear for");
    expect(select).toHaveValue("");
    expect(within(select).getByRole("option", { name: "Warlock (you)" })).toBeInTheDocument();
    // A Warlock cannot wear plate.
    await userEvent.selectOptions(select, "warlock");
    expect(url()).toBe("?class=warlock");
    await waitFor(() => expect(names()).toEqual([]));
    expect(screen.getByRole("button", { name: "Remove filter: Usable by Warlock" })).toBeInTheDocument();
    await userEvent.selectOptions(select, "warrior");
    expect(url()).toBe("?class=warrior");
    expect(screen.getByRole("button", { name: "Remove filter: Usable by Warrior" })).toBeInTheDocument();
    await userEvent.selectOptions(select, "");
    expect(url()).toBe("");
  });

  it("shows an older ?usable=1 link as the saved class in the picker", async () => {
    loadClientItems.mockResolvedValue(GEAR_LIST);
    renderPage("/wow-forever/auction-house?usable=1");
    expect(await screen.findByLabelText("Gear for")).toHaveValue("warlock");
    await userEvent.selectOptions(screen.getByLabelText("Gear for"), "");
    expect(url()).toBe("");
  });

  it("load straight away for a link that filters by gear, with the list skeleton until it is in", async () => {
    let finish: (list: ClientItemList) => void = () => undefined;
    loadClientItems.mockReturnValue(new Promise<ClientItemList>((resolve) => (finish = resolve)));
    renderPage("/wow-forever/auction-house?type=Plate");
    expect(loadClientItems).toHaveBeenCalled();
    expect(screen.getByTestId("auction-skeleton")).toBeInTheDocument();
    await act(async () => finish(GEAR_LIST));
    await waitFor(() => expect(names()).toEqual(["Test Helm"]));
  });

  it("show a retry when the item list fails to load", async () => {
    loadClientItems.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(GEAR_LIST);
    renderPage("/wow-forever/auction-house?slot=head");
    expect(await screen.findByText("Couldn't load the gear list.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(names()).toEqual(["Test Helm"]));
  });
});

describe("Auction house filters from sm up", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

  it("show inline under the search instead of in a sheet", async () => {
    renderPage();
    expect(screen.queryByTestId("auction-filter-panel")).toBeNull();
    await userEvent.click(screen.getByTestId("auction-filters-button"));
    expect(screen.queryByRole("dialog")).toBeNull();
    const panel = screen.getByTestId("auction-filter-panel");
    await userEvent.click(within(panel).getByRole("button", { name: "Rare" }));
    expect(names()).toEqual(["Large Brilliant Shard", "Test Helm"]);
    await userEvent.click(screen.getByTestId("auction-filters-button"));
    expect(screen.queryByTestId("auction-filter-panel")).toBeNull();
  });
});
