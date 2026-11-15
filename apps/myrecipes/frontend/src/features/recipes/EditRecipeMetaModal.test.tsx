/**
 * The edit dialog starts from the recipe as it is now on every open: a recipe
 * changed elsewhere shows its new values, and an abandoned half-typed edit is
 * not carried into the next open.
 */
import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { baseApi } from "@platform/ui";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import EditRecipeMetaModal from "@/features/recipes/EditRecipeMetaModal";

function recipeOf(overrides: Partial<RecipeDetailResponse>): RecipeDetailResponse {
  return {
    id: "r1",
    title: "Tomato soup",
    description: "Weeknight soup",
    source: "Grandma",
    ...overrides,
  } as RecipeDetailResponse;
}

function renderModal(recipe: RecipeDetailResponse, open: boolean) {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  const ui = (r: RecipeDetailResponse, o: boolean) => (
    <Provider store={store}>
      <EditRecipeMetaModal open={o} onClose={() => undefined} recipe={r} />
    </Provider>
  );
  const view = render(ui(recipe, open));
  return { rerender: (r: RecipeDetailResponse, o: boolean) => view.rerender(ui(r, o)) };
}

describe("EditRecipeMetaModal", () => {
  it("shows the current recipe after it changed while the dialog was closed", () => {
    const { rerender } = renderModal(recipeOf({}), false);
    rerender(recipeOf({ title: "Roasted tomato soup", description: null, source: "A cookbook" }), true);

    expect(screen.getByLabelText(/Title/)).toHaveValue("Roasted tomato soup");
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(screen.getByLabelText("Source")).toHaveValue("A cookbook");
  });

  it("does not bring back an abandoned edit when reopened", async () => {
    const { rerender } = renderModal(recipeOf({}), true);
    await userEvent.clear(screen.getByLabelText(/Title/));
    await userEvent.type(screen.getByLabelText(/Title/), "Half typed");

    rerender(recipeOf({}), false);
    rerender(recipeOf({}), true);

    expect(screen.getByLabelText(/Title/)).toHaveValue("Tomato soup");
  });
});
