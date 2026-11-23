/**
 * The edit dialog starts from the recipe as it is now on every open: a recipe
 * changed elsewhere shows its new values, and an abandoned half-typed edit is
 * not carried into the next open. Escape, a click outside and Cancel close it
 * straight away when nothing changed and ask first when something did, as the
 * phone does; a save closes it without asking.
 */
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISCARD_MESSAGES } from "@platform/core/constants/discard";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import EditRecipeMetaModal from "@/features/recipes/EditRecipeMetaModal";

const { updateRecipe, unwrap } = vi.hoisted(() => {
  const unwrap = vi.fn();
  return { unwrap, updateRecipe: vi.fn(() => ({ unwrap })) };
});

vi.mock("@myrecipes/api-client/store/recipesApi", () => ({
  useUpdateRecipeMutation: () => [updateRecipe, { isLoading: false }],
}));

function recipeOf(overrides: Partial<RecipeDetailResponse>): RecipeDetailResponse {
  return {
    id: "r1",
    title: "Tomato soup",
    description: "Weeknight soup",
    source: "Grandma",
    ...overrides,
  } as RecipeDetailResponse;
}

interface ModalState {
  recipe: RecipeDetailResponse;
  open: boolean;
}

function renderModal(recipe: RecipeDetailResponse, open: boolean, onClose: () => void = () => undefined) {
  // The page re-renders the dialog with new props, as RecipeDetail does, inside one router.
  let setState: (next: ModalState) => void = () => undefined;
  function Page() {
    const [state, set] = useState<ModalState>({ recipe, open });
    setState = set;
    return <EditRecipeMetaModal open={state.open} onClose={onClose} recipe={state.recipe} />;
  }
  const router = createMemoryRouter([{ path: "/recipes/r1", element: <Page /> }], {
    initialEntries: ["/recipes/r1"],
  });
  render(<RouterProvider router={router} />);
  return { rerender: (r: RecipeDetailResponse, o: boolean) => act(() => setState({ recipe: r, open: o })) };
}

function discardQuestion() {
  return screen.queryByRole("alertdialog", { name: DISCARD_MESSAGES.discardTitle });
}

beforeEach(() => {
  vi.clearAllMocks();
  unwrap.mockResolvedValue(recipeOf({}));
});

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

  it("closes on Escape without asking when nothing changed", async () => {
    const onClose = vi.fn();
    renderModal(recipeOf({}), true, onClose);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(discardQuestion()).toBeNull();
  });

  it("asks before Escape throws away an edit, and Keep editing keeps it", async () => {
    const onClose = vi.fn();
    renderModal(recipeOf({}), true, onClose);
    await userEvent.type(screen.getByLabelText("Source"), " and me");
    await userEvent.keyboard("{Escape}");

    expect(discardQuestion()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: DISCARD_MESSAGES.keepEditing })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: DISCARD_MESSAGES.keepEditing }));

    expect(discardQuestion()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Source")).toHaveValue("Grandma and me");
  });

  it("asks before Cancel throws away an edit, and Discard closes", async () => {
    const onClose = vi.fn();
    renderModal(recipeOf({}), true, onClose);
    await userEvent.type(screen.getByLabelText("Description"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(discardQuestion()).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: DISCARD_MESSAGES.discard }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes after a save without asking", async () => {
    const onClose = vi.fn();
    renderModal(recipeOf({}), true, onClose);
    await userEvent.type(screen.getByLabelText(/Title/), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateRecipe).toHaveBeenCalledWith({
      recipeId: "r1",
      body: { title: "Tomato soup!", description: "Weeknight soup", source: "Grandma" },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(discardQuestion()).toBeNull();
  });
});
