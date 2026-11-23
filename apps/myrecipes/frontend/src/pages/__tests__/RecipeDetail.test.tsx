/**
 * The recipe page's version panel: it only ever shows, and only ever logs a cook
 * against, the version picked in the timeline. While a picked version loads or
 * fails, RTK Query's `data` still holds the previously picked one; the page
 * must not show it.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VersionResponse, VersionSummary } from "@myrecipes/api-client/types/recipe/version";
import RecipeDetail from "@/pages/RecipeDetail";

type VersionState = "loaded" | "loading" | "failed";

const { useGetRecipeQuery, useListVersionsQuery, useGetVersionQuery, useListRecipeCooksQuery, useDeleteRecipeMutation, useDeleteCookMutation, useLogCookMutation } =
  vi.hoisted(() => ({
    useGetRecipeQuery: vi.fn(),
    useListVersionsQuery: vi.fn(),
    useGetVersionQuery: vi.fn(),
    useListRecipeCooksQuery: vi.fn(),
    useDeleteRecipeMutation: vi.fn(),
    useDeleteCookMutation: vi.fn(),
    useLogCookMutation: vi.fn(),
  }));

vi.mock("@myrecipes/api-client/store/recipesApi", () => ({
  useUpdateRecipeMutation: () => [vi.fn(), { isLoading: false }],
  useGetRecipeQuery,
  useListVersionsQuery,
  useGetVersionQuery,
  useListRecipeCooksQuery,
  useDeleteRecipeMutation,
  useDeleteCookMutation,
  useLogCookMutation,
}));

function versionOf(n: number): VersionResponse {
  return {
    id: `v${n}`,
    recipe_id: "r1",
    version_number: n,
    parent_version_id: n === 1 ? null : `v${n - 1}`,
    change_note: null,
    servings: null,
    prep_minutes: null,
    cook_minutes: null,
    created_at: "2026-11-11T00:00:00Z",
    ingredients: [{ id: `i${n}`, lineage_key: "lk", position: 0, name: `ingredient of v${n}`, quantity: 1, unit: null, note: null }],
    steps: [{ id: `s${n}`, position: 0, instruction: `step of v${n}` }],
  };
}

const VERSIONS = [versionOf(1), versionOf(2)];
const SUMMARIES = VERSIONS.map(
  (v): VersionSummary => ({
    id: v.id,
    version_number: v.version_number,
    change_note: null,
    created_at: v.created_at,
    cook_count: 0,
    best_rating: null,
  }),
);

/** Like RTK Query: `data` is the last version that resolved; `currentData` only the picked one's. */
function answerVersions(states: Record<string, VersionState>) {
  let lastResolved: VersionResponse | undefined;
  useGetVersionQuery.mockImplementation(({ versionId }: { versionId: string }) => {
    const state = states[versionId] ?? "loading";
    const version = VERSIONS.find((v) => v.id === versionId);
    if (state === "loaded") lastResolved = version;
    return {
      data: state === "loaded" ? version : lastResolved,
      currentData: state === "loaded" ? version : undefined,
      isLoading: false,
      isFetching: state === "loading",
      isError: state === "failed",
      refetch: vi.fn(),
    };
  });
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/recipes/r1"]}>
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const logCook = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useGetRecipeQuery.mockReturnValue({
    data: { id: "r1", title: "Tomato soup", description: null, source: null, is_owner: true, latest_version: VERSIONS[1] },
    isLoading: false,
    isError: false,
  });
  useListVersionsQuery.mockReturnValue({ data: SUMMARIES });
  useListRecipeCooksQuery.mockReturnValue({ data: [] });
  useDeleteRecipeMutation.mockReturnValue([vi.fn(), { isLoading: false }]);
  useDeleteCookMutation.mockReturnValue([vi.fn(), { isLoading: false }]);
  logCook.mockReturnValue({ unwrap: () => Promise.resolve() });
  useLogCookMutation.mockReturnValue([logCook, { isLoading: false }]);
});

describe("RecipeDetail byline", () => {
  const recipeOwnedBy = (name: string) => ({
    data: { id: "r1", title: "Tomato soup", description: null, source: null, is_owner: false, owner_display_name: name, latest_version: VERSIONS[1] },
    isLoading: false,
    isError: false,
  });

  it("says whose recipe it is under the title", () => {
    answerVersions({ v2: "loaded" });
    useGetRecipeQuery.mockReturnValue(recipeOwnedBy("Sam"));
    renderPage();
    expect(screen.getByText("by Sam")).toBeInTheDocument();
  });

  it("shows no byline when the owner's name is unknown", () => {
    answerVersions({ v2: "loaded" });
    useGetRecipeQuery.mockReturnValue(recipeOwnedBy(""));
    renderPage();
    expect(screen.queryByText(/^by /)).not.toBeInTheDocument();
  });
});

describe("RecipeDetail version panel", () => {
  it("shows the skeleton, not the previous version, while a picked version loads", async () => {
    answerVersions({ v2: "loaded" });
    renderPage();
    expect(screen.getByText("Viewing v2")).toBeInTheDocument();

    answerVersions({ v2: "loaded", v1: "loading" });
    await userEvent.click(screen.getByRole("button", { name: /^v1/ }));

    expect(screen.queryByText("Viewing v2")).not.toBeInTheDocument();
    expect(screen.queryByText("ingredient of v2")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading recipe detail…");
    expect(screen.getByRole("button", { name: "I made it" })).toBeDisabled();
  });

  it("shows the error with a retry, not the previous version, when a picked version fails", async () => {
    answerVersions({ v2: "loaded" });
    renderPage();

    answerVersions({ v2: "loaded", v1: "failed" });
    await userEvent.click(screen.getByRole("button", { name: /^v1/ }));

    expect(screen.queryByText("Viewing v2")).not.toBeInTheDocument();
    expect(screen.queryByText("ingredient of v2")).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't load this version")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I made it" })).toBeDisabled();
  });

  it("logs a cook against the version it names", async () => {
    answerVersions({ v2: "loaded" });
    renderPage();
    answerVersions({ v2: "loaded", v1: "loaded" });
    await userEvent.click(screen.getByRole("button", { name: /^v1/ }));
    expect(screen.getByText("Viewing v1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "I made it" }));
    const dialog = screen.getByRole("dialog", { name: "Log a cook" });
    expect(within(dialog).getByText("Recording how v1 turned out this time.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save cook" }));

    expect(logCook).toHaveBeenCalledWith(expect.objectContaining({ recipeId: "r1", versionId: "v1" }));
  });
});

describe("RecipeDetail when the recipe is refetched", () => {
  const RECIPE = { id: "r1", title: "Tomato soup", description: null, source: null, is_owner: true, latest_version: VERSIONS[1] };

  it("keeps the recipe on screen when a refetch fails", () => {
    answerVersions({ v2: "loaded" });
    useGetRecipeQuery.mockReturnValue({ data: RECIPE, isLoading: false, isError: true });
    renderPage();

    expect(screen.getByText("Viewing v2")).toBeInTheDocument();
    expect(screen.queryByText("Recipe not found")).not.toBeInTheDocument();
  });

  it.each([404, 422])("says the recipe wasn't found when the server answers %i", (status) => {
    useGetRecipeQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { status } });
    renderPage();

    expect(screen.getByText("Recipe not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it.each([[{ status: 500 }], [{ status: "FETCH_ERROR" }]])("says the recipe can't be loaded, not that it's gone, on %j, and tries again", async (error) => {
    const refetch = vi.fn();
    useGetRecipeQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error, refetch, isFetching: false });
    renderPage();

    expect(screen.getByText("Can't load this recipe")).toBeInTheDocument();
    expect(screen.queryByText("Recipe not found")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("disables the retry while it is fetching again", () => {
    useGetRecipeQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { status: 500 }, refetch: vi.fn(), isFetching: true });
    renderPage();

    expect(screen.getByRole("button", { name: /Try again/ })).toBeDisabled();
  });
});

describe("RecipeDetail cook log", () => {
  const COOK = { id: "c1", version_id: "v2", cooked_at: "2026-11-12T00:00:00Z", rating: 4, outcome_notes: "Needed more salt", created_at: "2026-11-12T00:00:00Z" };
  const EMPTY_TEXT = /No cooks logged yet/;

  beforeEach(() => answerVersions({ v2: "loaded" }));

  it("shows a skeleton, not the empty message, while the cook log loads", () => {
    useListRecipeCooksQuery.mockReturnValue({ data: undefined, isError: false, isFetching: true });
    renderPage();

    expect(screen.getByLabelText("Loading cook log")).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
  });

  it("says it couldn't load, not that nothing is logged, and tries again", async () => {
    const refetch = vi.fn();
    useListRecipeCooksQuery.mockReturnValue({ data: undefined, isError: true, isFetching: false, refetch });
    renderPage();

    expect(screen.getByText("Couldn't load your cook log.")).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the cooks on screen, with a note, when a refetch fails", () => {
    useListRecipeCooksQuery.mockReturnValue({ data: [COOK], isError: true, isFetching: false, refetch: vi.fn() });
    renderPage();

    expect(screen.getByText("Needed more salt")).toBeInTheDocument();
    expect(screen.getByText("Couldn't update your cook log. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your cook log.")).not.toBeInTheDocument();
  });

  it("shows the empty message only for a cook log that came back empty", () => {
    useListRecipeCooksQuery.mockReturnValue({ data: [], isError: false, isFetching: false });
    renderPage();

    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading cook log")).not.toBeInTheDocument();
  });
});

describe("RecipeDetail version timeline", () => {
  beforeEach(() => answerVersions({ v2: "loaded" }));

  it("shows a skeleton, not an empty rail, while the versions load", () => {
    useListVersionsQuery.mockReturnValue({ data: undefined, isError: false, isFetching: true });
    renderPage();

    expect(screen.getByLabelText("Loading versions")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Compare" })).not.toBeInTheDocument();
  });

  it("says it couldn't load the versions and tries again", async () => {
    const refetch = vi.fn();
    useListVersionsQuery.mockReturnValue({ data: undefined, isError: true, isFetching: false, refetch });
    renderPage();

    expect(screen.getByText("Can't load versions")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the versions on screen, with a note, when a refetch fails", () => {
    useListVersionsQuery.mockReturnValue({ data: SUMMARIES, isError: true, isFetching: false, refetch: vi.fn() });
    renderPage();

    expect(screen.getByRole("button", { name: /^v2/ })).toBeInTheDocument();
    expect(screen.getByText("Couldn't update the versions. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByText("Can't load versions")).not.toBeInTheDocument();
  });

  it("lists the versions when they load, with no note", () => {
    useListVersionsQuery.mockReturnValue({ data: SUMMARIES, isError: false, isFetching: false });
    renderPage();

    expect(screen.getByRole("button", { name: /^v1/ })).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't update the versions/)).not.toBeInTheDocument();
  });
});
