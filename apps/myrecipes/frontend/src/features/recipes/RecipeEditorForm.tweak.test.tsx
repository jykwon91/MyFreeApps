/**
 * Tweak mode of the recipe editor: it starts from the base version with each
 * ingredient's lineage key carried, needs a change note, posts the body the
 * shared builder makes, and says why a save failed by status (the copy shared
 * with the phone).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECIPE_FORM_PROBLEMS } from "@myrecipes/api-client/constants/recipeForm";
import { TWEAK_MESSAGES } from "@myrecipes/api-client/constants/tweak";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";

const { createVersion, unwrap, showError, showSuccess } = vi.hoisted(() => {
  const unwrap = vi.fn();
  return {
    unwrap,
    createVersion: vi.fn(() => ({ unwrap })),
    showError: vi.fn(),
    showSuccess: vi.fn(),
  };
});

vi.mock("@myrecipes/api-client/store/recipesApi", () => ({
  useCreateRecipeMutation: () => [vi.fn(), { isLoading: false }],
  useCreateVersionMutation: () => [createVersion, { isLoading: false }],
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, showError, showSuccess };
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
  ingredients: [
    { id: "i1", lineage_key: "lk-flour", position: 0, name: "flour", quantity: 2, unit: "cups", note: null },
    { id: "i2", lineage_key: "lk-salt", position: 1, name: "salt", quantity: 1, unit: "tsp", note: null },
  ],
  steps: [{ id: "s1", position: 0, instruction: "Mix." }],
};

function renderTweak() {
  render(
    <MemoryRouter initialEntries={["/recipes/r1/tweak"]}>
      <Routes>
        <Route path="/recipes/r1/tweak" element={<RecipeEditorForm mode="tweak" recipeId="r1" baseVersion={BASE} />} />
        <Route path="/recipes/r1" element={<p>Recipe page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  unwrap.mockResolvedValue(BASE);
});

describe("RecipeEditorForm (tweak)", () => {
  it("starts from the base version", () => {
    renderTweak();
    const names = screen.getAllByLabelText("Ingredient name");
    expect(names.map((input) => (input as HTMLInputElement).value)).toEqual(["flour", "salt"]);
    expect(screen.getByLabelText("Servings")).toHaveValue("4");
    expect(screen.getByLabelText("Prep (min)")).toHaveValue("10");
    expect(screen.getByLabelText("Step 1")).toHaveValue("Mix.");
  });

  it("asks for a change note and sends nothing without one", async () => {
    renderTweak();
    await userEvent.click(screen.getByRole("button", { name: "Save new version" }));
    expect(showError).toHaveBeenCalledWith(RECIPE_FORM_PROBLEMS.changeNoteRequired);
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("posts the tweak with the base version and lineage keys, then opens the recipe", async () => {
    renderTweak();
    await userEvent.type(screen.getByLabelText(/What did you change\?/), "  More salt ");
    const quantities = screen.getAllByLabelText("Quantity");
    await userEvent.clear(quantities[1]);
    await userEvent.type(quantities[1], "2");
    await userEvent.click(screen.getByRole("button", { name: "Save new version" }));

    expect(createVersion).toHaveBeenCalledWith({
      recipeId: "r1",
      body: {
        base_version_id: "v2",
        change_note: "More salt",
        servings: "4",
        prep_minutes: 10,
        cook_minutes: 25,
        ingredients: [
          { name: "flour", quantity: 2, unit: "cups", note: null, lineage_key: "lk-flour" },
          { name: "salt", quantity: 2, unit: "tsp", note: null, lineage_key: "lk-salt" },
        ],
        steps: [{ instruction: "Mix." }],
      },
    });
    expect(showSuccess).toHaveBeenCalledWith(TWEAK_MESSAGES.saved);
    expect(await screen.findByText("Recipe page")).toBeInTheDocument();
  });

  it.each([
    [404, TWEAK_MESSAGES.changedOrNotYours],
    [400, TWEAK_MESSAGES.changedOrNotYours],
    [422, TWEAK_MESSAGES.checkEntries],
    [500, TWEAK_MESSAGES.couldntSave],
  ])("says why a %i didn't save, and stays on the form", async (status, message) => {
    unwrap.mockRejectedValue({ status, data: { detail: "no" } });
    renderTweak();
    await userEvent.type(screen.getByLabelText(/What did you change\?/), "More salt");
    await userEvent.click(screen.getByRole("button", { name: "Save new version" }));
    expect(showError).toHaveBeenCalledWith(message);
    expect(screen.queryByText("Recipe page")).toBeNull();
  });
});
