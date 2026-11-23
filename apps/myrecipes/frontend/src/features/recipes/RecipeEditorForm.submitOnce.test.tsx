/**
 * Two submits before the first answers (a double click, Enter twice) make one recipe: the form
 * hasn't re-rendered between them, so only a guard held until the save answers can stop the second.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";

const { createRecipe, unwrap } = vi.hoisted(() => {
  const unwrap = vi.fn();
  return { unwrap, createRecipe: vi.fn(() => ({ unwrap })) };
});

vi.mock("@myrecipes/api-client/store/recipesApi", () => ({
  useCreateRecipeMutation: () => [createRecipe, { isLoading: false }],
  useCreateVersionMutation: () => [vi.fn(), { isLoading: false }],
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RecipeEditorForm (create), submitting twice quickly", () => {
  it("creates one recipe", async () => {
    let answer!: (recipe: { id: string }) => void;
    unwrap.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const router = createMemoryRouter([{ path: "/", element: <RecipeEditorForm mode="create" /> }]);
    render(<RouterProvider router={router} />);
    await userEvent.type(screen.getByLabelText(/^Title/), "Tomato soup");
    await userEvent.type(screen.getByLabelText("Ingredient name"), "tomatoes");
    await userEvent.type(screen.getByLabelText("Step 1"), "Simmer.");

    const form = screen.getByRole("button", { name: "Create recipe" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(createRecipe).toHaveBeenCalledTimes(1);
    answer({ id: "r-new" });
    await waitFor(() => expect(unwrap).toHaveBeenCalledTimes(1));
  });
});
