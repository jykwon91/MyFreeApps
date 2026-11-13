import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import WowAuctionHousePage from "@/games/wow-forever/pages/WowAuctionHousePage";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { REGION_STORAGE_KEY } from "@/games/wow-forever/hooks/useWowRegion";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import { PRICE_COLUMNS, pricesFailed, pricesLoading, pricesReady } from "@/test/auctionPricesStub";
import { iconSources, itemIconFile } from "./wowIconFiles";

const usePricesQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowPricesApi", async () => ({
  useGetWowPricesQuery: usePricesQuery,
  ...(await import("@/test/auctionPricesStub")).refreshApiStub,
}));

function response(items: PriceListResponse["items"], faction: PriceFaction = "alliance"): PriceListResponse {
  return {
    region: "us",
    server: "pvp",
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
  usePricesQuery.mockImplementation(({ faction }: PriceHouse) => pricesReady(response(items, faction)));
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

function itemName(row: HTMLElement): string | null {
  return within(row).getByTestId("auction-item-name").textContent;
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
    expect(rows().map((r) => itemName(r))).toEqual(["Linen Cloth", "Wool Cloth", "Silk Cloth"]);
    const silk = rows()[2];
    expect(within(silk).getByTestId("auction-market")).toHaveTextContent("50s");
    expect(within(silk).getByTestId("auction-cheapest")).toHaveTextContent("45s");
    expect(within(silk).getByTestId("auction-on-sale")).toHaveTextContent("12 in 1 auction");
    expect(within(silk).queryByRole("link")).toBeNull();
    expect(screen.getByTestId("price-credit")).toHaveTextContent("Prices from Blizzard (PvP · Alliance AH, US) · updated 2 hours ago");
  });

  it("uses the saved faction's auction house", () => {
    saveFaction("H");
    answerPerFaction();
    renderPage();
    expect(usePricesQuery).toHaveBeenLastCalledWith({ server: "pvp", faction: "horde" });
    expect(screen.getByRole("radio", { name: "Horde" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("price-credit")).toHaveTextContent("(PvP · Horde AH, US)");
  });

  it("switching to Horde saves it as your faction; Blackwater stays in the URL only", async () => {
    answerPerFaction();
    renderPage("/wow-forever/auction-house?q=cloth");
    await userEvent.click(screen.getByRole("radio", { name: "Horde" }));
    expect(usePricesQuery).toHaveBeenLastCalledWith({ server: "pvp", faction: "horde" });
    expect(JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}").faction).toBe("H");
    expect(screen.getByTestId("search")).toHaveTextContent("?q=cloth");

    await userEvent.click(screen.getByRole("radio", { name: "Blackwater" }));
    expect(usePricesQuery).toHaveBeenLastCalledWith({ server: "pvp", faction: "neutral" });
    expect(screen.getByTestId("search")).toHaveTextContent("house=neutral");
    expect(JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}").faction).toBe("H");
    expect(screen.getByTestId("price-credit")).toHaveTextContent("(PvP · Blackwater AH, US)");

    await userEvent.click(screen.getByRole("radio", { name: "Alliance" }));
    expect(usePricesQuery).toHaveBeenLastCalledWith({ server: "pvp", faction: "alliance" });
    expect(screen.getByTestId("search")).not.toHaveTextContent("house=");
  });

  it("opens on ?house= (an Ask link) without changing the saved faction", () => {
    answerPerFaction();
    renderPage("/wow-forever/auction-house?q=wool&house=neutral");
    expect(usePricesQuery).toHaveBeenLastCalledWith({ server: "pvp", faction: "neutral" });
    expect(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it("ignores a ?house= that isn't an auction house", () => {
    answerPerFaction();
    renderPage("/wow-forever/auction-house?house=goblins");
    expect(usePricesQuery).toHaveBeenLastCalledWith({ server: "pvp", faction: "alliance" });
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
    expect(itemName(rows()[0])).toBe("Silk Cloth");
  });

  it("is US only and ignores the saved server status region", () => {
    window.localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify("eu"));
    answerPerFaction();
    renderPage();
    expect(screen.queryByRole("radiogroup", { name: "Region" })).toBeNull();
    expect(usePricesQuery).toHaveBeenLastCalledWith({ server: "pvp", faction: "alliance" });
    expect(screen.getByTestId("price-credit")).toHaveTextContent("US)");
  });

  it("says when that auction house has no prices yet", () => {
    answerPerFaction([]);
    renderPage();
    expect(screen.getByText("No PvP · Alliance auction prices yet.")).toBeInTheDocument();
    expect(screen.getByTestId("price-credit")).toHaveTextContent("No PvP · Alliance auction prices yet.");
    expect(screen.queryByTestId("auction-results")).toBeNull();
  });

  it("warns when the prices are old", () => {
    usePricesQuery.mockReturnValue(pricesReady({ ...response(ITEMS), source_updated_at: "2020-01-01T00:00:00Z" }));
    renderPage();
    expect(screen.getByTestId("price-credit")).toHaveTextContent("these may be out of date");
    expect(screen.getByTestId("auction-stale-banner")).toHaveTextContent("These prices are old.");
  });

  it("shows no warning banner for fresh prices", () => {
    answerPerFaction();
    renderPage();
    expect(screen.queryByTestId("auction-stale-banner")).toBeNull();
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

describe("Auction house page: profession and recipe filters", () => {
  // Runed Copper Rod (spell 7421): 1 Copper Rod + 1 Mote of Magic -> 1 Runed Copper Rod.
  const CRAFTING_ITEMS: PriceListResponse["items"] = [
    ...ITEMS,
    [6217, 150, 140, 20, 4, "Copper Rod"],
    [247786, 250, 240, 600, 30, "Mote of Magic"],
    [6218, 1000, 900, 3, 2, "Runed Copper Rod"],
  ];

  beforeEach(() => {
    window.localStorage.clear();
    usePricesQuery.mockReset();
    answerPerFaction(CRAFTING_ITEMS);
  });

  it("narrows the list to a profession's materials and keeps it in the URL", async () => {
    renderPage();
    await userEvent.selectOptions(screen.getByTestId("auction-profession"), "enchanting");
    expect(screen.getByTestId("search")).toHaveTextContent("prof=enchanting");
    expect(await screen.findByTestId("auction-results-note")).toHaveTextContent(/Enchanting materials on sale · \d+ more have no auctions right now/);
    const names = rows().map((r) => itemName(r));
    expect(names).toContain("Mote of Magic");
    expect(names).not.toContain("Linen Cloth");
  });

  it("prices one recipe: each material, the total, what it sells for and the difference", async () => {
    renderPage("/wow-forever/auction-house?prof=enchanting");
    await userEvent.type(await screen.findByTestId("recipe-finder"), "copper rod");
    await userEvent.click(screen.getByRole("button", { name: "Runed Copper Rod (5)" }));
    expect(screen.getByTestId("search")).toHaveTextContent("recipe=7421");

    const panel = await screen.findByTestId("recipe-panel");
    expect(within(panel).getByRole("heading", { name: "Runed Copper Rod" })).toBeInTheDocument();
    expect(panel).toHaveTextContent("Makes 1 × Runed Copper Rod");
    const materials = within(panel).getAllByTestId("recipe-material");
    expect(materials.map((m) => m.firstElementChild?.textContent)).toEqual(["Copper Rod", "Mote of Magic"]);
    expect(within(materials[1]).getByTestId("recipe-each")).toHaveTextContent("2s 50c");
    expect(within(materials[1]).getByTestId("recipe-on-sale")).toHaveTextContent("600 in 30 auctions");
    expect(screen.getByTestId("recipe-materials-cost")).toHaveTextContent("4s");
    expect(screen.getByTestId("recipe-sells-for")).toHaveTextContent("10s each");
    expect(screen.getByTestId("recipe-profit")).toHaveTextContent("+6s");
    expect(screen.queryByRole("searchbox", { name: "Search items" })).toBeNull();

    await userEvent.click(screen.getByTestId("recipe-back"));
    expect(screen.getByTestId("search")).not.toHaveTextContent("recipe=");
    expect(await screen.findByTestId("recipe-finder")).toBeInTheDocument();
  });

  it("says 'at least' when a material has no auctions, and no difference", async () => {
    answerPerFaction(CRAFTING_ITEMS.filter(([id]) => id !== 6217));
    renderPage("/wow-forever/auction-house?prof=enchanting&recipe=7421");
    const panel = await screen.findByTestId("recipe-panel");
    expect(within(within(panel).getAllByTestId("recipe-material")[0]).getByTestId("recipe-on-sale")).toHaveTextContent("No auctions");
    expect(screen.getByTestId("recipe-materials-cost")).toHaveTextContent("at least 2s 50c (1 material with no auctions not counted)");
    expect(screen.queryByTestId("recipe-profit")).toBeNull();
  });

  it("says when a linked recipe isn't found, with the way back", async () => {
    renderPage("/wow-forever/auction-house?prof=enchanting&recipe=999999");
    expect(await screen.findByText("That Enchanting recipe wasn't found. Pick another from the list.")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-back")).toHaveTextContent("All Enchanting materials");
  });

  it("drops the recipe when the profession changes", async () => {
    renderPage("/wow-forever/auction-house?prof=enchanting&recipe=7421");
    await screen.findByTestId("recipe-panel");
    await userEvent.selectOptions(screen.getByTestId("auction-profession"), "tailoring");
    expect(screen.getByTestId("search")).toHaveTextContent("prof=tailoring");
    expect(screen.getByTestId("search")).not.toHaveTextContent("recipe=");
  });
});

describe("Auction house item icons", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePricesQuery.mockReset();
  });

  it("puts the item's icon before its name in each row", () => {
    answerPerFaction();
    renderPage();
    const linen = rows()[0];
    expect(within(linen).getByTestId("game-icon").getAttribute("src")).toContain(`/${itemIconFile(2589)}.webp`);
  });

  it("draws it 48px on a phone and 40px from sm, in a 2px frame, with the quality said to screen readers", () => {
    answerPerFaction();
    renderPage();
    const linen = rows()[0];
    const frame = within(linen).getByTestId("game-icon").parentElement as HTMLElement;
    expect(frame.getAttribute("style")).toContain("--icon-size: 48px");
    expect(frame.getAttribute("style")).toContain("--icon-sm-size: 40px");
    expect(frame.className).toContain("border-2");
    expect(frame.className).toContain("sm:h-[var(--icon-sm-size)]");
    expect(within(linen).getByText("Common quality")).toHaveClass("sr-only");
    expect(within(linen).getByTestId("auction-item-name")).toHaveClass("line-clamp-2");
  });

  it("keeps the same-size placeholder for an item with no icon", () => {
    answerPerFaction([[99999999, 700, 650, 5, 5, "No Icon Item"]]);
    renderPage();
    const placeholder = within(rows()[0]).getByTestId("game-icon-placeholder");
    expect(placeholder.getAttribute("style")).toContain("--icon-size: 48px");
    expect(within(rows()[0]).queryByText(/quality$/)).toBeNull();
  });

  it("shows icons on the recipe picker, the recipe title and each material", async () => {
    answerPerFaction([...ITEMS, [6217, 150, 140, 20, 4, "Copper Rod"], [247786, 250, 240, 600, 30, "Mote of Magic"], [6218, 1000, 900, 3, 2, "Runed Copper Rod"]]);
    renderPage("/wow-forever/auction-house?prof=enchanting");
    await userEvent.type(await screen.findByTestId("recipe-finder"), "copper rod");
    expect(within(screen.getByRole("button", { name: "Runed Copper Rod (5)" })).getByTestId("game-icon")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Runed Copper Rod (5)" }));
    const panel = await screen.findByTestId("recipe-panel");
    expect(within(panel).getByRole("heading", { name: "Runed Copper Rod" }).querySelector("[data-testid=game-icon]")).not.toBeNull();
    const materials = within(panel).getAllByTestId("recipe-material");
    expect(within(materials[0]).getByTestId("game-icon").getAttribute("src")).toContain(`/${itemIconFile(6217)}.webp`);
    expect(iconSources(panel).length).toBeGreaterThan(2);
  });
});
