import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import WowAuctionHousePage from "@/games/wow-forever/pages/WowAuctionHousePage";
import type { ItemCategoryIndex } from "@/games/wow-forever/types/auctionHouse/itemCategoryIndex";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import { PRICE_COLUMNS, pricesReady } from "@/test/auctionPricesStub";
import { ELIXIR, fixtureCategories, HELM, JUNK, LINEN_CLOTH, PEACEBLOOM, POTION } from "@/__tests__/wowItemCategoriesFixture";

const usePricesQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));

const loadItemCategories = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/lib/itemCategoriesLoader", () => ({ loadItemCategories }));

// [item_id, market_value, min_buyout, quantity, listings, name]
const ITEMS: PriceListResponse["items"] = [
  [POTION, 500, 450, 40, 8, "Major Healing Potion"],
  [ELIXIR, 900, 850, 20, 6, "Elixir of Giants"],
  [LINEN_CLOTH, 120, 100, 23980, 910, "Linen Cloth"],
  [PEACEBLOOM, 60, 50, 800, 90, "Peacebloom"],
  [JUNK, 10, 10, 3, 3, "Broken Tooth"],
  [HELM, 400_000, 380_000, 2, 1, "Test Helm"],
  [99999999, 700, 650, 5, 5, "Quest Thing"],
];

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

async function openFilters() {
  await userEvent.click(screen.getByTestId("auction-filters-button"));
  return screen.findByRole("dialog", { name: "Filters" });
}

beforeEach(() => {
  window.localStorage.clear();
  usePricesQuery.mockReset();
  loadItemCategories.mockReset();
  const data: PriceListResponse = {
    region: "us",
    server: "pvp",
    faction: "alliance",
    source_updated_at: new Date(Date.now() - 3_600_000).toISOString(),
    fetched_at: null,
    columns: PRICE_COLUMNS,
    items: ITEMS,
  };
  usePricesQuery.mockReturnValue(pricesReady(data));
});

describe("Auction house category filter", () => {
  it("offers the categories first, and does not fetch the item categories until one is picked", async () => {
    loadItemCategories.mockResolvedValue(fixtureCategories());
    renderPage();
    const sheet = await openFilters();
    const group = within(sheet).getByTestId("auction-category-group");
    expect(group.compareDocumentPosition(within(sheet).getByTestId("auction-filter-quality")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const label of ["Consumable", "Trade Goods", "Gear", "Recipe", "Reagent", "Container", "Projectile", "Quiver", "Miscellaneous"]) {
      expect(within(group).getByRole("button", { name: label })).toHaveClass("min-h-[44px]");
    }
    expect(loadItemCategories).not.toHaveBeenCalled();
  });

  it("picks Consumable then Potions: the URL and the list narrow, and the chip names the subclass", async () => {
    loadItemCategories.mockResolvedValue(fixtureCategories());
    renderPage();
    const sheet = await openFilters();
    await userEvent.click(within(sheet).getByRole("button", { name: "Consumable" }));
    expect(url()).toBe("?cat=consumable");
    expect(loadItemCategories).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(names()).toEqual(["Major Healing Potion", "Elixir of Giants"]));

    const kinds = within(await within(sheet).findByTestId("auction-filter-subcategory"));
    expect(kinds.getAllByRole("button").map((b) => b.textContent)).toEqual(["All consumable", "Potions", "Elixirs"]);
    expect(kinds.getByRole("button", { name: "All consumable" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(kinds.getByRole("button", { name: "Potions" }));
    expect(url()).toBe("?cat=consumable&sub=1");
    expect(names()).toEqual(["Major Healing Potion"]);
    expect(within(screen.getByTestId("auction-active-filters")).getByRole("button", { name: "Remove filter: Category: Potions" })).toBeInTheDocument();
  });

  it("clears the subclass when another category is picked, and the category when it is pressed again", async () => {
    loadItemCategories.mockResolvedValue(fixtureCategories());
    renderPage("/wow-forever/auction-house?cat=consumable&sub=2");
    const sheet = await openFilters();
    await waitFor(() => expect(names()).toEqual(["Elixir of Giants"]));
    await userEvent.click(within(sheet).getByRole("button", { name: "Trade Goods" }));
    expect(url()).toBe("?cat=trade-goods");
    await waitFor(() => expect(names()).toEqual(["Linen Cloth", "Peacebloom"]));
    await userEvent.click(within(within(sheet).getByTestId("auction-filter-category")).getByRole("button", { name: "Trade Goods" }));
    expect(url()).toBe("");
    expect(names()).toHaveLength(ITEMS.length);
    expect(within(sheet).queryByTestId("auction-filter-subcategory")).toBeNull();
  });

  it("removing the active chip clears the category and its subclass", async () => {
    loadItemCategories.mockResolvedValue(fixtureCategories());
    renderPage("/wow-forever/auction-house?cat=consumable&sub=1");
    const chips = within(screen.getByTestId("auction-active-filters"));
    await userEvent.click(await chips.findByRole("button", { name: "Remove filter: Category: Potions" }));
    expect(url()).toBe("");
    expect(names()).toHaveLength(ITEMS.length);
  });

  it("shows skeleton chips and the list skeleton until the categories are in, never an unfiltered list", async () => {
    let finish: (index: ItemCategoryIndex) => void = () => undefined;
    loadItemCategories.mockReturnValue(new Promise<ItemCategoryIndex>((resolve) => (finish = resolve)));
    renderPage();
    const sheet = await openFilters();
    await userEvent.click(within(sheet).getByRole("button", { name: "Consumable" }));
    expect(within(sheet).getByTestId("auction-category-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("auction-skeleton")).toBeInTheDocument();
    expect(names()).toEqual([]);
    await act(async () => finish(fixtureCategories()));
    await waitFor(() => expect(names()).toEqual(["Major Healing Potion", "Elixir of Giants"]));
    expect(screen.queryByTestId("auction-category-skeleton")).toBeNull();
  });

  it("loads straight away for a link that already has a category", async () => {
    loadItemCategories.mockResolvedValue(fixtureCategories());
    renderPage("/wow-forever/auction-house?cat=trade-goods&sub=9");
    expect(loadItemCategories).toHaveBeenCalled();
    await waitFor(() => expect(names()).toEqual(["Peacebloom"]));
  });

  it("files an item the game data does not list under Miscellaneous", async () => {
    loadItemCategories.mockResolvedValue(fixtureCategories());
    renderPage("/wow-forever/auction-house?cat=misc");
    await waitFor(() => expect(names()).toEqual(["Quest Thing", "Broken Tooth"]));
  });

  it("points Gear at the Gear filters instead of offering subclasses", async () => {
    loadItemCategories.mockResolvedValue(fixtureCategories());
    renderPage();
    const sheet = await openFilters();
    await userEvent.click(within(sheet).getByRole("button", { name: "Gear" }));
    expect(url()).toBe("?cat=gear");
    await waitFor(() => expect(names()).toEqual(["Test Helm"]));
    expect(within(sheet).queryByTestId("auction-filter-subcategory")).toBeNull();
    expect(within(sheet).getByText(/with the Gear filters below/)).toBeInTheDocument();
  });

  it("ignores a category or subclass in a link that is not allowed", () => {
    renderPage("/wow-forever/auction-house?cat=weapons&sub=abc");
    expect(names()).toHaveLength(ITEMS.length);
    expect(loadItemCategories).not.toHaveBeenCalled();
    expect(screen.queryByTestId("auction-active-filters")).toBeNull();
  });

  it("names the category when nothing matches, and Clear filters removes it", async () => {
    loadItemCategories.mockResolvedValue(fixtureCategories());
    renderPage("/wow-forever/auction-house?cat=recipe&q=potion");
    await waitFor(() => expect(screen.getByTestId("auction-empty")).toHaveTextContent('No items match "potion" with these filters: Category: Recipe.'));
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(url()).toBe("?q=potion");
    expect(names()).toEqual(["Major Healing Potion"]);
  });

  it("shows the whole category, with All pressed, for a link naming a subclass the category lacks", async () => {
    loadItemCategories.mockResolvedValue(fixtureCategories());
    renderPage("/wow-forever/auction-house?cat=consumable&sub=99");
    await waitFor(() => expect(names()).toEqual(["Major Healing Potion", "Elixir of Giants"]));
    expect(within(screen.getByTestId("auction-active-filters")).getByRole("button", { name: "Remove filter: Category: Consumable" })).toBeInTheDocument();
    const sheet = await openFilters();
    const kinds = within(await within(sheet).findByTestId("auction-filter-subcategory"));
    expect(kinds.getByRole("button", { name: "All consumable" })).toHaveAttribute("aria-pressed", "true");
  });

  it("forgets a failed load when the category is cleared, so picking one again shows loading, not the old error", async () => {
    let finish: (index: ItemCategoryIndex) => void = () => undefined;
    loadItemCategories
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValueOnce(new Promise<ItemCategoryIndex>((resolve) => (finish = resolve)));
    renderPage("/wow-forever/auction-house?cat=consumable");
    expect(await screen.findAllByText("Couldn't load the item categories.")).not.toHaveLength(0);
    const sheet = await openFilters();
    await userEvent.click(within(sheet).getByRole("button", { name: "Consumable" }));
    expect(url()).toBe("");
    await userEvent.click(within(sheet).getByRole("button", { name: "Consumable" }));
    expect(screen.queryByText("Couldn't load the item categories.")).toBeNull();
    expect(within(sheet).getByTestId("auction-category-skeleton")).toBeInTheDocument();
    await act(async () => finish(fixtureCategories()));
    await waitFor(() => expect(names()).toEqual(["Major Healing Potion", "Elixir of Giants"]));
  });

  it("shows a retry when the item categories fail to load", async () => {
    loadItemCategories.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(fixtureCategories());
    renderPage("/wow-forever/auction-house?cat=consumable");
    expect(await screen.findAllByText("Couldn't load the item categories.")).not.toHaveLength(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]);
    await waitFor(() => expect(names()).toEqual(["Major Healing Potion", "Elixir of Giants"]));
  });
});
