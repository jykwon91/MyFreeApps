/**
 * The new-recipe editor (blank, a photo's draft, a discovered draft) asks before leaving
 * throws away what's typed, as the phone does: Keep editing stays, Discard goes, an untouched
 * form leaves without asking, and leaving after a save is never stopped.
 */
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISCARD_MESSAGES } from "@platform/core/constants/discard";
import { CHOOSE_AGAIN_DISCARD_COPY, DRAFT_DISCARD_COPY } from "@myrecipes/api-client/constants/recipeDiscard";
import type { DraftSeed } from "@myrecipes/api-client/types/recipe/draft-seed";
import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";

const { createRecipe, unwrap, onCancel } = vi.hoisted(() => {
  const unwrap = vi.fn();
  return { unwrap, createRecipe: vi.fn(() => ({ unwrap })), onCancel: vi.fn() };
});

vi.mock("@myrecipes/api-client/store/recipesApi", () => ({
  useCreateRecipeMutation: () => [createRecipe, { isLoading: false }],
  useCreateVersionMutation: () => [vi.fn(), { isLoading: false }],
}));

const DRAFT: RecipeExtractionDraft = {
  title: "Tomato soup",
  description: null,
  source: null,
  servings: "4",
  prep_minutes: null,
  cook_minutes: null,
  ingredients: [{ name: "tomatoes", quantity: 2, unit: "cans", note: null }],
  steps: [{ instruction: "Simmer." }],
};

function renderNew(props: { seed?: DraftSeed; withCancel?: boolean } = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/recipes/new",
        element: (
          <>
            <Link to="/">Recipes</Link>
            <RecipeEditorForm
              mode="create"
              seed={props.seed}
              onCancel={props.withCancel ? onCancel : undefined}
              cancelCopy={props.withCancel ? CHOOSE_AGAIN_DISCARD_COPY : undefined}
            />
          </>
        ),
      },
      { path: "/", element: <p>Recipes page</p> },
      { path: "/recipes/:id", element: <p>Recipe page</p> },
    ],
    { initialEntries: ["/", "/recipes/new"], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function asking(title: string) {
  return screen.queryByRole("alertdialog", { name: title });
}

beforeEach(() => {
  vi.clearAllMocks();
  unwrap.mockResolvedValue({ id: "r9" });
});

describe("RecipeEditorForm (create) unsaved changes", () => {
  it("leaves an untouched blank form without asking", async () => {
    renderNew();
    await userEvent.click(screen.getByRole("link", { name: "Recipes" }));
    expect(await screen.findByText("Recipes page")).toBeInTheDocument();
  });

  it("asks before a link throws away what's typed; Keep editing keeps it", async () => {
    const router = renderNew();
    await userEvent.type(screen.getByLabelText(/^Title/), "Soup");
    await userEvent.click(screen.getByRole("link", { name: "Recipes" }));

    expect(asking(DISCARD_MESSAGES.discardTitle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: DISCARD_MESSAGES.keepEditing })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: DISCARD_MESSAGES.keepEditing }));

    expect(asking(DISCARD_MESSAGES.discardTitle)).toBeNull();
    expect(router.state.location.pathname).toBe("/recipes/new");
    expect(screen.getByLabelText(/^Title/)).toHaveValue("Soup");
  });

  it("Cancel asks too, and Discard goes back", async () => {
    renderNew();
    await userEvent.type(screen.getByLabelText("Step 1"), "Stir.");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(asking(DISCARD_MESSAGES.discardTitle)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: DISCARD_MESSAGES.discard }));
    expect(await screen.findByText("Recipes page")).toBeInTheDocument();
  });

  it("doesn't ask after the recipe is created", async () => {
    renderNew();
    await userEvent.type(screen.getByLabelText(/^Title/), "Soup");
    await userEvent.type(screen.getByLabelText("Ingredient name"), "salt");
    await userEvent.type(screen.getByLabelText("Step 1"), "Stir.");
    await userEvent.click(screen.getByRole("button", { name: "Create recipe" }));

    expect(await screen.findByText("Recipe page")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("always asks before leaving a photo's draft, which would need reading again", async () => {
    renderNew({ seed: { draft: DRAFT, origin: "photo" } });
    await userEvent.click(screen.getByRole("link", { name: "Recipes" }));
    expect(asking(DRAFT_DISCARD_COPY.photo.discardTitle)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: DRAFT_DISCARD_COPY.photo.discard }));
    expect(await screen.findByText("Recipes page")).toBeInTheDocument();
  });

  it("asks before Cancel takes a photo's draft back to choosing a photo", async () => {
    renderNew({ seed: { draft: DRAFT, origin: "photo" }, withCancel: true });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(asking(CHOOSE_AGAIN_DISCARD_COPY.discardTitle)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: CHOOSE_AGAIN_DISCARD_COPY.keepEditing }));
    expect(onCancel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: CHOOSE_AGAIN_DISCARD_COPY.discard }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("leaves a discovered draft untouched without asking, but asks once it's edited", async () => {
    renderNew({ seed: { draft: DRAFT, origin: "discover" }, withCancel: true });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await userEvent.type(screen.getByLabelText(/^Title/), "!");
    await userEvent.click(screen.getByRole("link", { name: "Recipes" }));
    expect(asking(DISCARD_MESSAGES.discardTitle)).toBeInTheDocument();
  });

  it("keeps focus where you're typing when the page rebuilds its seed on a re-render", async () => {
    let rerenderPage: () => void = () => {};
    function Page() {
      const [, setTick] = useState(0);
      rerenderPage = () => setTick((n) => n + 1);
      // A fresh seed object each render, as Discover builds it.
      return <RecipeEditorForm mode="create" seed={{ draft: { ...DRAFT, title: "" }, origin: "discover" }} />;
    }
    const router = createMemoryRouter([{ path: "/recipes/new", element: <Page /> }], {
      initialEntries: ["/recipes/new"],
    });
    render(<RouterProvider router={router} />);

    // A draft without a title starts on Title.
    expect(screen.getByLabelText(/^Title/)).toHaveFocus();
    await userEvent.click(screen.getByLabelText("Description"));
    await userEvent.type(screen.getByLabelText("Description"), "Smooth");
    act(() => rerenderPage());

    expect(screen.getByLabelText("Description")).toHaveFocus();
  });
});
