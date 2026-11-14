import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import WowRecipesPage from "@/games/wow-forever/pages/WowRecipesPage";
import { RECIPES_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";
import itemCategoriesJson from "@/games/wow-forever/data/items/itemCategories.json";
import { decodeItemCategories } from "@/games/wow-forever/lib/auctionHouse/decodeItemCategories";
import type { ItemCategoriesFile } from "@/games/wow-forever/types/auctionHouse/itemCategoriesFile";

// The page fetches the item categories over HTTP; the tests hand it the same file.
const loadItemCategories = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/lib/itemCategoriesLoader", () => ({ loadItemCategories }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/wow-forever/recipes"
          element={
            <>
              <WowRecipesPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const LOAD = { timeout: 15000 };

describe("WowRecipesPage", { timeout: 30000 }, () => {
  beforeEach(() => {
    vi.resetModules();
    loadItemCategories.mockReset();
    loadItemCategories.mockResolvedValue(decodeItemCategories(itemCategoriesJson as unknown as ItemCategoriesFile));
  });

  it("shows the skeleton, then asks for a search before listing anything", async () => {
    renderAt("/wow-forever/recipes");
    expect(screen.getByTestId("recipes-skeleton")).toBeInTheDocument();
    expect(await screen.findByText(RECIPES_TEXT.prompt, undefined, LOAD)).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-row")).toBeNull();
  });

  it("finds a recipe by name, with its ingredients and how to learn it", async () => {
    const user = userEvent.setup();
    renderAt("/wow-forever/recipes");
    await user.type(await screen.findByTestId("recipe-search", undefined, LOAD), "linen bandage");
    const rows = await screen.findAllByTestId("recipe-row", undefined, LOAD);
    const first = rows[0]!;
    expect(within(first).getAllByText("Linen Bandage")[0]).toBeInTheDocument();
    expect(within(first).getByTestId("recipe-reagents")).toHaveTextContent("Linen Cloth");
    expect(within(first).getByTestId("recipe-learn-summary")).toHaveTextContent(/^First Aid 1 · /);
    expect(screen.getByTestId("search")).toHaveTextContent("q=linen+bandage");
  });

  it("lists a profession from the URL by skill, and says when nothing matches", async () => {
    const user = userEvent.setup();
    renderAt("/wow-forever/recipes?p=firstaid&c=bandages");
    const rows = await screen.findAllByTestId("recipe-row", undefined, LOAD);
    expect(rows.length).toBeGreaterThan(1);
    expect(within(rows[0]!).getAllByText("Linen Bandage")[0]).toBeInTheDocument();
    await user.type(screen.getByTestId("recipe-search"), "zzzz qqqq");
    expect(await screen.findByText(RECIPES_TEXT.noMatch, undefined, LOAD)).toBeInTheDocument();
  });

  it("pages a long list with Show more", async () => {
    const user = userEvent.setup();
    renderAt("/wow-forever/recipes?p=tailoring");
    const before = (await screen.findAllByTestId("recipe-row", undefined, LOAD)).length;
    await user.click(screen.getByTestId("recipe-more"));
    expect(screen.getAllByTestId("recipe-row").length).toBeGreaterThan(before);
  });

  it("offers a retry when the recipes don't load", async () => {
    loadItemCategories.mockRejectedValue(new Error("offline"));
    const { default: Page } = await import("@/games/wow-forever/pages/WowRecipesPage");
    render(
      <MemoryRouter initialEntries={["/wow-forever/recipes"]}>
        <Page />
      </MemoryRouter>,
    );
    expect(await screen.findByText(RECIPES_TEXT.loadError, undefined, LOAD)).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-search")).toBeNull();
  });
});
