import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PROVENANCE_LABEL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import WowItemPage from "@/games/wow-forever/pages/WowItemPage";

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
  beforeEach(() => window.localStorage.clear());

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

  it("goes Back to the page that opened it", async () => {
    renderAt("/wow-forever/items/11815", "/wow-forever/gear?class=rogue");
    await screen.findByRole("heading", { level: 1, name: "Hand of Justice" });
    expect(screen.getByRole("link", { name: "Back to Best gear" })).toHaveAttribute("href", "/wow-forever/gear?class=rogue");
  });

  it("says a Classic item hasn't appeared in Forever yet, without saying it doesn't exist", async () => {
    renderAt("/wow-forever/items/809");
    expect(await screen.findByRole("heading", { level: 1, name: "Bloodrazor" })).toBeInTheDocument();
    expect(screen.getByText(/hasn't appeared in WoW Forever's game files yet/)).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Find an item" })).toHaveValue("Bloodrazor");
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
    renderAt("/wow-forever/items/14152");
    await screen.findByRole("heading", { level: 1, name: "Robe of the Archmage" });
    const sources = howToGet();
    expect(within(sources).getAllByTestId("game-icon").length).toBeGreaterThan(0);
  });
});
