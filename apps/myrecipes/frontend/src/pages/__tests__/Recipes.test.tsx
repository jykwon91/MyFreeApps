/**
 * The recipes list pages through GET /recipes: a "Load more" footer fetches
 * the next page (recipe 51 on), and a new search starts again from the first.
 */
import { configureStore } from "@reduxjs/toolkit";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseApi } from "@platform/ui";
import api from "@/lib/api";
import { RECIPES_PAGE_SIZE } from "@myrecipes/api-client/constants/recipesPaging";
import type { RecipeListPage } from "@myrecipes/api-client/types/recipe/recipe-list-page";
import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import { RECIPE_SEARCH_DEBOUNCE_MS } from "@/constants/recipe-search";
import Recipes from "@/pages/Recipes";

const TOTAL = 60;

function summary(n: number, prefix = "Recipe"): RecipeSummary {
  return {
    id: `${prefix}-${n}`,
    title: `${prefix} ${n}`,
    description: null,
    source: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    version_count: 1,
    latest_version_number: 1,
    is_owner: false,
    owner_display_name: "Sam",
    best_rating: null,
    last_cooked_at: null,
  };
}

function pageAt(offset: number, total: number, prefix?: string): RecipeListPage {
  const count = Math.max(0, Math.min(RECIPES_PAGE_SIZE, total - offset));
  const items = Array.from({ length: count }, (_, i) => summary(offset + i + 1, prefix));
  return { items, total, has_more: offset + count < total };
}

type Respond = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

const listCalls: InternalAxiosRequestConfig[] = [];
let respond: Respond;
let store: ReturnType<typeof makeStore>;
const originalAdapter = api.defaults.adapter;

const adapter: AxiosAdapter = async (config) => {
  if (config.url === "/recipes") listCalls.push(config);
  const { status, data } = respond(config);
  if (status >= 400) throw Object.assign(new Error("failed"), { response: { status, data }, config, isAxiosError: true });
  return { status, data, statusText: "", headers: {}, config };
};

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

function renderRecipes() {
  store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Recipes />
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  listCalls.length = 0;
  api.defaults.adapter = adapter;
  respond = (config) => {
    const offset = Number(config.params?.offset ?? 0);
    return config.params?.search
      ? { status: 200, data: pageAt(offset, 2, "Soup") }
      : { status: 200, data: pageAt(offset, TOTAL) };
  };
});

afterEach(() => {
  act(() => {
    store.dispatch(baseApi.util.resetApiState());
  });
  api.defaults.adapter = originalAdapter;
  vi.useRealTimers();
});

describe("Recipes", () => {
  it("loads the second page from the footer and shows recipe 51 on", async () => {
    const user = userEvent.setup();
    renderRecipes();

    expect(await screen.findByRole("heading", { name: "Recipe 50" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recipe 51" })).not.toBeInTheDocument();
    expect(screen.getByText(`Showing ${RECIPES_PAGE_SIZE} of ${TOTAL} recipes`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("heading", { name: "Recipe 51" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recipe 60" })).toBeInTheDocument();
    expect(listCalls.map((config) => config.params?.offset)).toEqual([0, RECIPES_PAGE_SIZE]);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("starts a search from the first page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRecipes();
    await screen.findByRole("heading", { name: "Recipe 1" });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: "Recipe 51" });
    listCalls.length = 0;

    await user.type(screen.getByLabelText("Search recipes by title"), "soup");
    await act(async () => {
      vi.advanceTimersByTime(RECIPE_SEARCH_DEBOUNCE_MS);
    });

    expect(await screen.findByRole("heading", { name: "Soup 1" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Recipe 51" })).not.toBeInTheDocument());
    expect(listCalls.map((config) => config.params)).toEqual([
      { search: "soup", owner: undefined, limit: RECIPES_PAGE_SIZE, offset: 0 },
    ]);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("keeps the loaded recipes and offers Try again when the next page fails", async () => {
    const user = userEvent.setup();
    renderRecipes();
    await screen.findByRole("heading", { name: "Recipe 50" });

    respond = () => ({ status: 503, data: { detail: "down" } });
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load more recipes.");
    expect(screen.getByRole("heading", { name: "Recipe 50" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
