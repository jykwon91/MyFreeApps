/**
 * Deleting a recipe from its page: a 404 means it's already gone, so the page treats it as deleted
 * (says so and leaves for the list); any other failure keeps the recipe and says the delete failed.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECIPE_MANAGE_MESSAGES } from "@myrecipes/api-client/constants/recipeManage";
import RecipeDetail from "@/pages/RecipeDetail";

const { deleteRecipe, showSuccess, showError } = vi.hoisted(() => ({
  deleteRecipe: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess,
  showError,
}));

vi.mock("@myrecipes/api-client/store/recipesApi", () => ({
  useUpdateRecipeMutation: () => [vi.fn(), { isLoading: false }],
  useGetRecipeQuery: () => ({
    data: { id: "r1", title: "Tomato soup", description: null, source: null, is_owner: true, latest_version: null },
    isLoading: false,
    isError: false,
  }),
  useListVersionsQuery: () => ({ data: [] }),
  useGetVersionQuery: () => ({ data: undefined, currentData: undefined, isFetching: false, isError: false }),
  useListRecipeCooksQuery: () => ({ data: [] }),
  useDeleteRecipeMutation: () => [deleteRecipe, { isLoading: false }],
  useDeleteCookMutation: () => [vi.fn(), { isLoading: false }],
  useLogCookMutation: () => [vi.fn(), { isLoading: false }],
}));

function failWith(error: unknown) {
  deleteRecipe.mockReturnValue({ unwrap: () => Promise.reject(error) });
}

async function confirmDelete() {
  render(
    <MemoryRouter initialEntries={["/recipes/r1"]}>
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/" element={<p>Recipes list</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
  await userEvent.click(screen.getByRole("button", { name: RECIPE_MANAGE_MESSAGES.deleteConfirm }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RecipeDetail delete", () => {
  it("treats a 404 as already deleted: says so and goes back to the list", async () => {
    failWith({ status: 404, data: { detail: "Recipe not found" } });
    await confirmDelete();

    expect(showSuccess).toHaveBeenCalledWith(RECIPE_MANAGE_MESSAGES.gone);
    expect(showError).not.toHaveBeenCalled();
    expect(await screen.findByText("Recipes list")).toBeInTheDocument();
  });

  it("keeps the recipe and says it failed on any other failure", async () => {
    failWith({ status: 500, data: { detail: "boom" } });
    await confirmDelete();

    expect(showError).toHaveBeenCalledWith(RECIPE_MANAGE_MESSAGES.couldntDelete);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText("Recipes list")).not.toBeInTheDocument();
  });
});
