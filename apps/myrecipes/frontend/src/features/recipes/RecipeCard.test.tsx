/**
 * Unit tests for RecipeCard — the recipe list tile.
 *
 * MyRecipes is public-read / auth-write: recipe cards render for everyone, but
 * the star-rating and last-cooked block is owner-private. These tests pin the
 * guest-vs-owner rendering rules:
 *   - owner     → rating + last-cooked block shown
 *   - non-owner → that block omitted entirely (not dashed), attribution shown
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import RecipeCard from "@/features/recipes/RecipeCard";
import type { RecipeSummary } from "@/types/recipe/recipe";

function makeRecipe(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id: "r1",
    title: "Sourdough Loaf",
    description: "A tangy overnight bake",
    source: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    version_count: 3,
    latest_version_number: 3,
    best_rating: 4,
    last_cooked_at: "2026-02-01T00:00:00Z",
    is_owner: true,
    owner_display_name: "Alice",
    ...overrides,
  };
}

function renderCard(recipe: RecipeSummary) {
  return render(
    <MemoryRouter>
      <RecipeCard recipe={recipe} />
    </MemoryRouter>,
  );
}

describe("RecipeCard", () => {
  it("shows the rating and last-cooked block for the owner", () => {
    renderCard(makeRecipe({ is_owner: true, best_rating: 4 }));
    expect(screen.getByRole("img", { name: /4 out of 5 stars/i })).toBeInTheDocument();
    expect(screen.getByText(/last cooked/i)).toBeInTheDocument();
  });

  it("shows 'Not cooked yet' for an owner who hasn't cooked", () => {
    renderCard(makeRecipe({ is_owner: true, best_rating: null, last_cooked_at: null }));
    expect(screen.getByText(/not cooked yet/i)).toBeInTheDocument();
  });

  it("omits the rating and last-cooked block entirely for non-owners", () => {
    renderCard(makeRecipe({ is_owner: false, best_rating: null, last_cooked_at: null }));
    // No star rating rendered (not even a dash) and no cook status line.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(/last cooked/i)).toBeNull();
    expect(screen.queryByText(/not cooked yet/i)).toBeNull();
  });

  it("renders attribution when owner_display_name is present", () => {
    renderCard(makeRecipe({ is_owner: false, owner_display_name: "Bob" }));
    expect(screen.getByText(/by Bob/i)).toBeInTheDocument();
  });

  it("omits attribution when owner_display_name is empty", () => {
    renderCard(makeRecipe({ is_owner: true, owner_display_name: "" }));
    expect(screen.queryByText(/^by /i)).toBeNull();
  });

  it("always shows the version count for everyone", () => {
    renderCard(makeRecipe({ is_owner: false, version_count: 2 }));
    expect(screen.getByText(/2 versions/i)).toBeInTheDocument();
  });
});
