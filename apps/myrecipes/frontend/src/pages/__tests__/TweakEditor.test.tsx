/**
 * The tweak page starts from the recipe as fetched after opening: a version
 * cached earlier (before someone tweaked it elsewhere) is never the base, and
 * the base stays put once loaded.
 */
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
});
