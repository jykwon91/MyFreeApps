import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PROVENANCE_LABEL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import WowItemPage from "@/games/wow-forever/pages/WowItemPage";
import { priceList, pricesLoading, pricesReady } from "@/test/auctionPricesStub";

const usePricesQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));

// Robe of the Archmage's recipe, at 1s a material (Viridian Dye 10c). The robe binds on pickup, so it never sells.
const ARCHMAGE_PRICES: [number, number, string][] = [
  [14048, 100, "Bolt of Runecloth"],
  [7078, 100, "Essence of Fire"],
  [7082, 100, "Essence of Air"],
  [7076, 100, "Essence of Earth"],
  [7080, 100, "Essence of Water"],
  [14341, 100, "Rune Thread"],
  [249431, 10, "Viridian Dye"],
];

function renderAt(path: string, from?: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state: from ? { from } : null }]}>
      <Routes>
        <Route path="/wow-forever/items/:id" element={<WowItemPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function howToGet() {
  return screen.getByRole("heading", { level: 2, name: "How to get it" }).closest("section") as HTMLElement;
}

describe("item page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePricesQuery.mockReturnValue(pricesLoading());
  });

  it("shows the skeleton, then the item, its tooltip and the boss that drops it", async () => {
    renderAt("/wow-forever/items/11815");
    expect(screen.getByTestId("item-page-skeleton")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Hand of Justice" })).toBeInTheDocument();
    const stats = screen.getByTestId("item-stats");
    expect(within(stats).getByText("Binds when picked up")).toBeInTheDocument();
    expect(within(stats).getByText("Item Level 58")).toBeInTheDocument();
    const sources = howToGet();
    expect(within(sources).getByRole("heading", { level: 3, name: "Dungeon drop" })).toBeInTheDocument();
    expect(within(sources).getByText(/Emperor Dagran Thaurissan · boss/)).toBeInTheDocument();
    expect(within(sources).getByText(/In Blackrock Depths/)).toBeInTheDocument();
    expect(within(sources).getByText(PROVENANCE_LABEL.classic)).toBeInTheDocument();
    expect(within(sources).getAllByRole("link", { name: /Directions/ })[0]).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/wow-forever\/map\?to=pt%3A.+&dir=1$/),
    );
  });

  it("labels a recipe as Forever game data and links its crafting guide", async () => {
    renderAt("/wow-forever/items/14152");
    await screen.findByRole("heading", { level: 1, name: "Robe of the Archmage" });
    const sources = howToGet();
    expect(within(sources).getByText(PROVENANCE_LABEL.client)).toBeInTheDocument();
    expect(within(sources).getByRole("link", { name: "Crafting guide" })).toHaveAttribute(
      "href",
      "/wow-forever/professions?p=tailoring&skill=295",
    );
  });

  it("prices a bind-on-pickup crafted item's materials, without a buy price or a craft-or-buy verdict", async () => {
    usePricesQuery.mockReturnValue(pricesReady(priceList(ARCHMAGE_PRICES)));
    renderAt("/wow-forever/items/14152");
    await screen.findByRole("heading", { level: 1, name: "Robe of the Archmage" });
    const sources = howToGet();
    expect(within(sources).getByText("(~12s for 12)")).toBeInTheDocument();
    const prices = within(sources).getByTestId("crafted-prices");
    // 12 + 4 × 8 + 2 at 1s, and 10 Viridian Dye at 10c: ~47s.
    expect(within(prices).getByText("Materials for one craft").nextSibling).toHaveTextContent("~47s");
    expect(within(prices).queryByText("Buy one at the auction house")).not.toBeInTheDocument();
    expect(within(prices).queryByText(/^Cheaper to/)).not.toBeInTheDocument();
  });

  it("leaves a material with no auction price out of the sum, and gives no verdict", async () => {
    usePricesQuery.mockReturnValue(pricesReady(priceList(ARCHMAGE_PRICES.filter(([id]) => id !== 249431))));
    renderAt("/wow-forever/items/14152");
    await screen.findByRole("heading", { level: 1, name: "Robe of the Archmage" });
    const prices = within(howToGet()).getByTestId("crafted-prices");
    expect(within(prices).getByText("~46s")).toBeInTheDocument();
    expect(within(prices).getByText("plus Viridian Dye (no auction price)")).toBeInTheDocument();
    expect(within(prices).queryByText(/^Cheaper to/)).not.toBeInTheDocument();
  });

  it("goes Back to the page that opened it", async () => {
    renderAt("/wow-forever/items/11815", "/wow-forever/gear?class=rogue");
    await screen.findByRole("heading", { level: 1, name: "Hand of Justice" });
    expect(screen.getByRole("link", { name: "Back to Best gear" })).toHaveAttribute("href", "/wow-forever/gear?class=rogue");
  });

  it("says a Classic item hasn't appeared in Forever yet, without saying it doesn't exist", async () => {
    renderAt("/wow-forever/items/913");
    expect(await screen.findByRole("heading", { level: 1, name: "Huge Ogre Sword" })).toBeInTheDocument();
    expect(screen.getByText(/hasn't appeared in WoW Forever's game files yet/)).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Find an item" })).toHaveValue("Huge Ogre Sword");
  });

  it("says a link to no item is not found and offers a search", async () => {
    renderAt("/wow-forever/items/not-an-item");
    expect(await screen.findByRole("heading", { level: 1, name: "Item not found" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Find an item" })).toHaveValue("");
  });
});

describe("item page crafted-by icons", () => {
  it("shows the recipe's reagent icons", async () => {
    window.localStorage.clear();
    usePricesQuery.mockReturnValue(pricesLoading());
    renderAt("/wow-forever/items/14152");
    await screen.findByRole("heading", { level: 1, name: "Robe of the Archmage" });
    const sources = howToGet();
    expect(within(sources).getAllByTestId("game-icon").length).toBeGreaterThan(0);
  });
});
