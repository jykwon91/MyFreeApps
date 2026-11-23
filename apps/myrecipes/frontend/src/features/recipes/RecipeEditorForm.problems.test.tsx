/**
 * What stops a save is said on the field itself, announced and marked invalid, and the first
 * invalid field in form order takes focus. A row added to a list takes focus too.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECIPE_FORM_PROBLEMS } from "@myrecipes/api-client/constants/recipeForm";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";

const { createRecipe, createVersion, showError } = vi.hoisted(() => ({
  createRecipe: vi.fn(),
  createVersion: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@myrecipes/api-client/store/recipesApi", () => ({
  useCreateRecipeMutation: () => [createRecipe, { isLoading: false }],
  useCreateVersionMutation: () => [createVersion, { isLoading: false }],
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, showError };
});

const BASE: VersionResponse = {
  id: "v2",
  recipe_id: "r1",
  version_number: 2,
  parent_version_id: "v1",
  change_note: null,
  servings: "4",
  prep_minutes: 10,
  cook_minutes: 25,
  created_at: "2026-11-11T00:00:00Z",
  ingredients: [{ id: "i1", lineage_key: "lk-flour", position: 0, name: "", quantity: null, unit: null, note: null }],
  steps: [{ id: "s1", position: 0, instruction: "Mix." }],
};

function renderCreate() {
  const router = createMemoryRouter([{ path: "/", element: <RecipeEditorForm mode="create" /> }]);
  render(<RouterProvider router={router} />);
}

function renderTweak() {
  const router = createMemoryRouter([
    { path: "/", element: <RecipeEditorForm mode="tweak" recipeId="r1" baseVersion={BASE} /> },
  ]);
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RecipeEditorForm problems (create)", () => {
  it("shows every problem on its field and focuses the first, the title", async () => {
    renderCreate();
    await userEvent.type(screen.getByLabelText("Quantity", { exact: true }), "1/2");
    await userEvent.click(screen.getByRole("button", { name: "Create recipe" }));

    const title = screen.getByLabelText(/^Title/);
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveFocus();
    expect(screen.getByText(RECIPE_FORM_PROBLEMS.titleRequired)).toBeInTheDocument();
    expect(title).toHaveAccessibleDescription(RECIPE_FORM_PROBLEMS.titleRequired);

    const quantity = screen.getByLabelText("Quantity", { exact: true });
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Ingredient name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(RECIPE_FORM_PROBLEMS.ingredientNameRequired)).toBeInTheDocument();
    expect(showError).toHaveBeenCalledWith(RECIPE_FORM_PROBLEMS.titleRequired);
    expect(createRecipe).not.toHaveBeenCalled();
  });

  it("focuses the first invalid field in form order when the title is fine", async () => {
    renderCreate();
    await userEvent.type(screen.getByLabelText(/^Title/), "Soup");
    await userEvent.type(screen.getByLabelText("Cook (min)"), "soon");
    await userEvent.type(screen.getByLabelText("Step 1"), "Simmer.");
    await userEvent.click(screen.getByRole("button", { name: "Create recipe" }));

    expect(screen.getByLabelText("Cook (min)")).toHaveFocus();
    expect(screen.getByLabelText("Cook (min)")).toHaveAttribute("aria-invalid", "true");
  });

  it("says nothing about what is missing before the first save attempt", () => {
    renderCreate();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).not.toHaveAttribute("aria-invalid");
  });
});

describe("RecipeEditorForm problems (tweak)", () => {
  it("puts the change note first, and focuses it", async () => {
    renderTweak();
    await userEvent.click(screen.getByRole("button", { name: "Save new version" }));

    const note = screen.getByLabelText(/^What did you change/);
    expect(note).toHaveFocus();
    expect(note).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(RECIPE_FORM_PROBLEMS.changeNoteRequired)).toBeInTheDocument();
    expect(showError).toHaveBeenCalledWith(RECIPE_FORM_PROBLEMS.changeNoteRequired);
    expect(screen.getByRole("button", { name: "Add ingredient" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(RECIPE_FORM_PROBLEMS.ingredientsRequired)).toBeInTheDocument();
  });
});

describe("RecipeEditorForm added rows", () => {
  it("focuses a new ingredient row's name", async () => {
    renderCreate();
    await userEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    const names = screen.getAllByLabelText("Ingredient name");
    expect(names).toHaveLength(2);
    expect(names[1]).toHaveFocus();
  });

  it("focuses a new step row", async () => {
    renderCreate();
    await userEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(screen.getByLabelText("Step 2")).toHaveFocus();
  });
});
