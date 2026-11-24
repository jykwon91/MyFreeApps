import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import { buildRecipeItemIndex } from "@/games/wow-forever/lib/itemPages/recipeItemIndex";
import { reagentsText, recipeRequiresText, recipeUseText } from "@/games/wow-forever/lib/itemPages/recipeItemText";
import { CRAFTING_PROFESSION, type CraftingFile, type CraftRecipe } from "@/games/wow-forever/types/crafting";

function recipe(overrides: Partial<CraftRecipe>): CraftRecipe {
  return { spell: 1, name: "Thing", yellow: 1, grey: 2, reagents: [], learn: { source: "trainer" }, ...overrides };
}

function file(recipes: CraftRecipe[]): CraftingFile {
  return { source: "test", skillLine: 1, madeBy: {}, recipes };
}

describe("recipe item index", () => {
  const boots = recipe({
    spell: 18423,
    name: "Runecloth Boots",
    reagents: [
      { id: 14048, name: "Bolt of Runecloth", count: 4 },
      { id: 14341, name: "Rune Thread", count: 1 },
    ],
    creates: { id: 13864, name: "Runecloth Boots", count: 1, quality: 2 },
    learn: { source: "item", skill: 235, itemId: 14488, item: "Pattern: Runecloth Boots", bop: true },
  });
  const index = buildRecipeItemIndex(
    new Map([
      [CRAFTING_PROFESSION.tailoring, file([boots, recipe({ spell: 2, learn: { source: "trainer" } })])],
      [
        CRAFTING_PROFESSION.enchanting,
        file([recipe({ spell: 3, name: "Enchant Bracer", enchant: true, learn: { source: "item", skill: 10, itemId: 555, item: "Formula: X", estimated: true } })]),
      ],
    ]),
  );

  it("keys only recipes an item teaches, by that item's id", () => {
    expect([...index.keys()].sort((a, b) => a - b)).toEqual([555, 14488]);
  });

  it("carries the skill, bind, product and reagents", () => {
    expect(index.get(14488)).toMatchObject({
      name: "Pattern: Runecloth Boots",
      profession: "tailoring",
      skill: 235,
      estimated: false,
      bop: true,
      creates: { id: 13864, name: "Runecloth Boots" },
    });
    expect(index.get(14488)?.reagents).toHaveLength(2);
  });

  it("words the teach lines like the game; an estimated skill says 'about'; an enchant names its recipe", () => {
    const pattern = index.get(14488)!;
    expect(recipeRequiresText(pattern)).toBe("Requires Tailoring (235)");
    expect(recipeUseText(pattern)).toBe("Use: Teaches you how to make Runecloth Boots");
    expect(reagentsText(pattern.reagents)).toBe("Reagents: Bolt of Runecloth (4), Rune Thread");
    const formula = index.get(555)!;
    expect(recipeRequiresText(formula)).toBe("Requires Enchanting (about 10)");
    expect(recipeUseText(formula)).toBe("Use: Teaches you how to make Enchant Bracer");
  });
});

function hoverLink(itemId: number, name: string): HTMLElement {
  render(
    <MemoryRouter>
      <ItemNameLink itemId={itemId} name={name} />
    </MemoryRouter>,
  );
  fireEvent.pointerEnter(screen.getByRole("link", { name }), { pointerType: "mouse" });
  return screen.getByRole("link", { name });
}

describe("recipe item tooltip (real profession data)", () => {
  it("Pattern: Runecloth Boots (not in the Forever item files) shows what it teaches and the boots' stats", async () => {
    hoverLink(14488, "Pattern: Runecloth Boots");
    const tooltip = await screen.findByTestId("recipe-item-tooltip", {}, { timeout: 5000 });
    expect(within(tooltip).getByText("Pattern: Runecloth Boots")).toBeInTheDocument();
    expect(within(tooltip).getByText("Binds when picked up")).toBeInTheDocument();
    expect(within(tooltip).getByText("Requires Tailoring (235)")).toBeInTheDocument();
    expect(within(tooltip).getByText("Use: Teaches you how to make Runecloth Boots")).toBeInTheDocument();
    const stats = within(tooltip).getByTestId("item-stats");
    expect(stats).toHaveTextContent("Runecloth Boots");
    expect(stats).toHaveTextContent("50 Armor");
    expect(tooltip).toHaveTextContent("Reagents: Bolt of Runecloth (4), Ironweb Spider Silk (2), Rugged Leather (4), Rune Thread");
    expect(screen.queryByText(/No stats for this item/)).not.toBeInTheDocument();
  });

  it("an item that teaches nothing keeps the plain note", async () => {
    hoverLink(999_999_9, "Nothing");
    expect(await screen.findByText(/No stats for this item/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-item-tooltip")).not.toBeInTheDocument();
  });
});
