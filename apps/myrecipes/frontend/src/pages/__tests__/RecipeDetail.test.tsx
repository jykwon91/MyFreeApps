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

describe("RecipeDetail version panel", () => {
  it("shows the skeleton, not the previous version, while a picked version loads", async () => {
    answerVersions({ v2: "loaded" });
    renderPage();
    expect(screen.getByText("Viewing v2")).toBeInTheDocument();

    answerVersions({ v2: "loaded", v1: "loading" });
    await userEvent.click(screen.getByRole("button", { name: /^v1/ }));

    expect(screen.queryByText("Viewing v2")).not.toBeInTheDocument();
    expect(screen.queryByText("ingredient of v2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Loading recipe")).toBeInTheDocument();
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
