/**
 * The version diff page: its header and sections come from the shared
 * diffSummary and change words, and a failure says why by status (the copy
 * shared with the phone).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION_COPY } from "@myrecipes/api-client/constants/versions";
import type { DiffResponse } from "@myrecipes/api-client/types/recipe/diff";
import VersionDiff from "@/pages/VersionDiff";

interface DiffQuery {
  data?: DiffResponse;
  error?: unknown;
  isLoading: boolean;
  isError: boolean;
}

const { useGetDiffQuery, useGetRecipeQuery } = vi.hoisted(() => ({
  useGetDiffQuery: vi.fn(),
  useGetRecipeQuery: vi.fn(),
}));

vi.mock("@myrecipes/api-client/store/recipesApi", () => ({ useGetDiffQuery, useGetRecipeQuery }));

const SALT = { name: "salt", quantity: 1, unit: "tsp", note: null };
const DIFF: DiffResponse = {
  from_version_id: "v1",
  from_version_number: 1,
  to_version_id: "v3",
  to_version_number: 3,
  ingredient_changes: [{ lineage_key: "lk-salt", change: "changed", before: SALT, after: { ...SALT, quantity: 2 } }],
  step_changes: [{ position: 1, change: "removed", before: "Stir.", after: null }],
};

function answer(query: Partial<DiffQuery>, isOwner = false) {
  useGetDiffQuery.mockReturnValue({ isLoading: false, isError: false, ...query });
  useGetRecipeQuery.mockReturnValue({ data: { is_owner: isOwner } });
}

function renderDiff(path = "/recipes/r1/versions/v3/diff?against=v1") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/recipes/:id/versions/:vid/diff" element={<VersionDiff />} />
        <Route path="/recipes/:id" element={<p>Recipe page</p>} />
        <Route path="/recipes/:id/tweak" element={<p>Tweak page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VersionDiff", () => {
  it("asks for the pair in the link and heads the diff with what changed", () => {
    answer({ data: DIFF });
    renderDiff();

    expect(useGetDiffQuery).toHaveBeenCalledWith({ recipeId: "r1", versionId: "v3", against: "v1" }, { skip: false });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("v1 to v3");
    expect(screen.getByText("2 changes — 1 ingredient, 1 step.")).toBeInTheDocument();
    expect(screen.getByText("Changed:")).toBeInTheDocument();
    expect(screen.getByText("Removed:")).toBeInTheDocument();
    expect(screen.getByText("1 tsp salt")).toBeInTheDocument();
    expect(screen.getByText("2 tsp salt")).toBeInTheDocument();
  });

  it("compares the first version against nothing", () => {
    answer({ data: { ...DIFF, from_version_id: null, from_version_number: null, to_version_number: 1 } });
    renderDiff();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("nothing to v1");
  });

  it("calls two versions with no differences identical", () => {
    answer({ data: { ...DIFF, ingredient_changes: [], step_changes: [] } });
    renderDiff();
    expect(screen.getByText(VERSION_COPY.noDifferences)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: VERSION_COPY.identicalHeading })).toBeInTheDocument();
  });

  it.each([
    [400, VERSION_COPY.notInRecipe],
    [404, VERSION_COPY.recipeOrVersionGone],
    [422, VERSION_COPY.invalidLink],
  ])("says why on a %i", (status, message) => {
    answer({ isError: true, error: { status, data: { detail: "no" } } });
    renderDiff();
    expect(screen.getByRole("heading", { name: VERSION_COPY.loadFailedHeading })).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("keeps the general message for other failures, and goes back to the recipe", async () => {
    answer({ isError: true, error: { status: "FETCH_ERROR" } });
    renderDiff();
    expect(screen.getByText(VERSION_COPY.loadFailedBody)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Back to recipe" }));
    expect(screen.getByText("Recipe page")).toBeInTheDocument();
  });

  it("offers a tweak only to the owner", () => {
    answer({ data: DIFF });
    renderDiff();
    expect(screen.queryByRole("button", { name: "Tweak this recipe" })).not.toBeInTheDocument();
  });

  it("opens the tweak form for the owner", async () => {
    answer({ data: DIFF }, true);
    renderDiff();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tweak this recipe" }));
    expect(screen.getByText("Tweak page")).toBeInTheDocument();
  });
});
