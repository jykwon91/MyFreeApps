/**
 * The tweak page starts from the recipe as fetched after opening: a version
 * cached earlier (before someone tweaked it elsewhere) is never the base, and
 * the base stays put once loaded.
 */
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import TweakEditor from "@/pages/TweakEditor";

const { useGetRecipeQuery } = vi.hoisted(() => ({ useGetRecipeQuery: vi.fn() }));

vi.mock("@myrecipes/api-client/store/recipesApi", () => ({ useGetRecipeQuery }));
vi.mock("@/features/recipes/RecipeEditorForm", () => ({
  default: ({ baseVersion }: { baseVersion: VersionResponse }) => <p>Form on v{baseVersion.version_number}</p>,
}));

function recipeAt(versionNumber: number, isOwner = true): RecipeDetailResponse {
  return {
    id: "r1",
    title: "Soup",
    is_owner: isOwner,
    latest_version: { id: `v${versionNumber}`, version_number: versionNumber },
  } as RecipeDetailResponse;
}

/** What RTK Query hands back: the cache entry from before opening, or an answer fetched since. */
function answer(data: RecipeDetailResponse | undefined, fulfilledTimeStamp: number | undefined) {
  useGetRecipeQuery.mockReturnValue({ currentData: data, data, fulfilledTimeStamp, isError: false, error: undefined, refetch: vi.fn() });
}

/** A request that failed after the page opened: the first answer has no error, then this one does. */
function failWith(error: unknown, refetch = vi.fn(), isFetching = false) {
  answer(undefined, undefined);
  const view = renderEditor();
  useGetRecipeQuery.mockReturnValue({ currentData: undefined, data: undefined, fulfilledTimeStamp: undefined, isError: true, error, isFetching, refetch });
  view.rerender(
    <MemoryRouter>
      <TweakEditor recipeId="r1" onMissing={vi.fn()} />
    </MemoryRouter>,
  );
  return refetch;
}

function renderEditor() {
  return render(
    <MemoryRouter>
      <TweakEditor recipeId="r1" onMissing={vi.fn()} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TweakEditor", () => {
  it("asks for the recipe again on opening", () => {
    answer(undefined, undefined);
    renderEditor();
    expect(useGetRecipeQuery).toHaveBeenCalledWith("r1", { refetchOnMountOrArgChange: true });
  });

  it("does not start from a version cached before opening, only from the answer fetched after", () => {
    answer(recipeAt(2), 100);
    const { rerender } = renderEditor();
    expect(screen.queryByText(/Form on/)).not.toBeInTheDocument();
    expect(screen.queryByText("Recipe not found")).not.toBeInTheDocument();

    answer(recipeAt(3), 200);
    rerender(
      <MemoryRouter>
        <TweakEditor recipeId="r1" onMissing={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Form on v3")).toBeInTheDocument();
  });

  it("keeps the version it started from when the recipe is refetched later", () => {
    answer(undefined, undefined);
    const { rerender } = renderEditor();
    answer(recipeAt(3), 200);
    rerender(
      <MemoryRouter>
        <TweakEditor recipeId="r1" onMissing={vi.fn()} />
      </MemoryRouter>,
    );
    answer(recipeAt(4), 300);
    rerender(
      <MemoryRouter>
        <TweakEditor recipeId="r1" onMissing={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Form on v3")).toBeInTheDocument();
  });

  it("tells a non-owner they can only tweak their own recipes", () => {
    answer(undefined, undefined);
    const { rerender } = renderEditor();
    answer(recipeAt(1, false), 200);
    rerender(
      <MemoryRouter>
        <TweakEditor recipeId="r1" onMissing={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("You can only tweak your own recipes")).toBeInTheDocument();
  });

  it.each([404, 422])("says the recipe wasn't found when the server answers %i", (status) => {
    failWith({ status });
    expect(screen.getByText("Recipe not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it.each([[{ status: 500 }], [{ status: "FETCH_ERROR" }]])("says the recipe can't be loaded, not that it's gone, on %j, and tries again", async (error) => {
    const refetch = failWith(error);
    expect(screen.getByText("Can't load this recipe")).toBeInTheDocument();
    expect(screen.queryByText("Recipe not found")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("disables the retry while it is fetching again", () => {
    failWith({ status: 500 }, vi.fn(), true);
    expect(screen.getByRole("button", { name: /Try again/ })).toBeDisabled();
  });

  it("says the recipe wasn't found when it has no version to tweak", () => {
    answer(undefined, undefined);
    const { rerender } = renderEditor();
    answer({ ...recipeAt(1), latest_version: null } as unknown as RecipeDetailResponse, 200);
    rerender(
      <MemoryRouter>
        <TweakEditor recipeId="r1" onMissing={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Recipe not found")).toBeInTheDocument();
  });
});
