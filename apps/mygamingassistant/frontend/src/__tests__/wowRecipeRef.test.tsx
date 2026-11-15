import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecipeRef from "@/games/wow-forever/components/recipes/RecipeRef";
import { recipeEntryLookup } from "@/games/wow-forever/lib/recipes/recipeEntryLookup";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

const mockRecipeLookup = vi.fn();
vi.mock("@/games/wow-forever/hooks/useRecipeLookup", () => ({ useRecipeLookup: () => mockRecipeLookup() }));

const LINEN_ENTRY = {
  key: "tailoring:2963", profession: "tailoring", name: "Bolt of Linen Cloth", icon: { fileDataId: 132889, quality: "common" },
  makes: { id: 2996, name: "Bolt of Linen Cloth", count: 1, quality: "common" }, category: "trade-goods", skill: 1,
  yellow: null, green: null, grey: null, reagents: [], learn: { kind: "start" }, recipeSources: null, sourceUnknown: false,
  spec: null, searchName: "bolt of linen cloth", nameWords: [], recipeItemWords: [], reagentWords: [],
} as unknown as RecipeEntry;

const LINEN_HREF = "/wow-forever/recipes?q=Bolt+of+Linen+Cloth&p=tailoring";

function renderRef(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  mockRecipeLookup.mockReturnValue(recipeEntryLookup([LINEN_ENTRY]));
});

describe("a recipe name anywhere in WoW Forever", () => {
  it("links to the full recipe when its data is found by spell", () => {
    renderRef(<RecipeRef profession="tailoring" spell={2963} name="Bolt of Linen Cloth" />);
    expect(screen.getByRole("link", { name: "Bolt of Linen Cloth" })).toHaveAttribute("href", LINEN_HREF);
  });

  it("falls back to the name when there's no spell", () => {
    renderRef(<RecipeRef profession="tailoring" spell={null} name="Bolt of Linen Cloth" />);
    expect(screen.getByRole("link", { name: "Bolt of Linen Cloth" })).toHaveAttribute("href", LINEN_HREF);
  });

  it("shows the recipe's icon when asked", () => {
    const { container } = renderRef(<RecipeRef profession="tailoring" spell={2963} name="Bolt of Linen Cloth" iconSize={16} />);
    expect(container.querySelector("a img")).not.toBeNull();
  });

  it("stays plain text while the recipes load", () => {
    mockRecipeLookup.mockReturnValue(null);
    renderRef(<RecipeRef profession="tailoring" spell={2963} name="Bolt of Linen Cloth" iconSize={16} />);
    expect(screen.getByText("Bolt of Linen Cloth")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("stays plain text for a recipe the Recipes page doesn't have", () => {
    renderRef(<RecipeRef profession="tailoring" spell={9999} name="Smelt Copper" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("stays plain text for a profession the Recipes page doesn't list", () => {
    renderRef(<RecipeRef profession={null} spell={2963} name="Bolt of Linen Cloth" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
