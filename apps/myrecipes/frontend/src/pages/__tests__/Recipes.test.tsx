/**
 * The recipes list pages through GET /recipes: a "Load more" footer fetches
 * the page after the first page's cursor (recipe 51 on), and a new search starts again from the first.
 */
import { configureStore } from "@reduxjs/toolkit";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseApi } from "@platform/ui";
import api from "@/lib/api";
import { recipesApi } from "@myrecipes/api-client/store/recipesApi";
import { RECIPES_MINE_EMPTY_COPY } from "@myrecipes/api-client/constants/recipesListCopy";
import { RECIPES_PAGE_SIZE } from "@myrecipes/api-client/constants/recipesPaging";
import type { RecipeListPage } from "@myrecipes/api-client/types/recipe/recipe-list-page";
import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import { RECIPE_SEARCH_DEBOUNCE_MS } from "@/constants/recipe-search";
import { STALE_DATA_MESSAGES } from "@/constants/stale-data-messages";
import Recipes from "@/pages/Recipes";

const auth = vi.hoisted(() => ({ isAuthenticated: true }));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, useIsAuthenticated: () => auth.isAuthenticated };
});

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

/** This fake server's cursor names how many recipes came before the next page. */
const cursorAfter = (n: number) => `after-${n}`;

function pageAfter(cursor: string | undefined, total: number, prefix?: string): RecipeListPage {
  const start = cursor === undefined ? 0 : Number(cursor.replace("after-", ""));
  const count = Math.max(0, Math.min(RECIPES_PAGE_SIZE, total - start));
  const items = Array.from({ length: count }, (_, i) => summary(start + i + 1, prefix));
  const hasMore = start + count < total;
  return { items, total, has_more: hasMore, next_cursor: hasMore ? cursorAfter(start + count) : null };
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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function HistoryProbe() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)}>history back</button>
      <button onClick={() => navigate(1)}>history forward</button>
    </>
  );
}

function renderRecipes(initialEntry: string | string[] = "/") {
  store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={Array.isArray(initialEntry) ? initialEntry : [initialEntry]}
        initialIndex={Array.isArray(initialEntry) ? initialEntry.length - 1 : 0}
      >
        <Recipes />
        <LocationProbe />
        <HistoryProbe />
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  auth.isAuthenticated = true;
  listCalls.length = 0;
  api.defaults.adapter = adapter;
  respond = (config) => {
    const cursor: string | undefined = config.params?.cursor;
    return config.params?.search
      ? { status: 200, data: pageAfter(cursor, 2, "Soup") }
      : { status: 200, data: pageAfter(cursor, TOTAL) };
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
    expect(listCalls.map((config) => config.params?.cursor)).toEqual([undefined, cursorAfter(RECIPES_PAGE_SIZE)]);
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
      { search: "soup", owner: undefined, limit: RECIPES_PAGE_SIZE, cursor: undefined },
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

  it("offers Try again when the list can't load, and shows the recipes once it does", async () => {
    const user = userEvent.setup();
    const working = respond;
    respond = () => ({ status: 503, data: { detail: "down" } });
    renderRecipes();

    expect(await screen.findByText("Can't load recipes")).toBeInTheDocument();
    respond = working;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Recipe 1" })).toBeInTheDocument();
    expect(screen.queryByText("Can't load recipes")).not.toBeInTheDocument();
  });

  it("keeps the recipes with a notice and Try again when a refresh fails", async () => {
    const user = userEvent.setup();
    const working = respond;
    renderRecipes();
    await screen.findByRole("heading", { name: "Recipe 50" });

    respond = () => ({ status: 503, data: { detail: "down" } });
    act(() => {
      store.dispatch(recipesApi.util.invalidateTags([{ type: "Recipe", id: "LIST" }]));
    });

    expect(await screen.findByText(STALE_DATA_MESSAGES.recipes)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recipe 50" })).toBeInTheDocument();
    expect(screen.queryByText("Can't load recipes")).not.toBeInTheDocument();

    respond = working;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText(STALE_DATA_MESSAGES.recipes)).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Recipe 50" })).toBeInTheDocument();
  });

  it("loads the public list and clears ?owner=me when signed out", async () => {
    auth.isAuthenticated = false;
    renderRecipes("/?owner=me");

    expect(await screen.findByRole("heading", { name: "Recipe 1" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
    expect(listCalls.length).toBeGreaterThan(0);
    expect(listCalls.every((config) => config.params?.owner === undefined)).toBe(true);
    expect(screen.queryByRole("button", { name: "My recipes" })).not.toBeInTheDocument();
  });

  it("still sends owner=me when signed in", async () => {
    renderRecipes("/?owner=me");

    expect(await screen.findByRole("heading", { name: "Recipe 1" })).toBeInTheDocument();
    expect(listCalls[0]?.params?.owner).toBe("me");
    expect(screen.getByTestId("location")).toHaveTextContent("/?owner=me");
  });

  it("puts the URL's search back in the box on browser Back and Forward", async () => {
    const user = userEvent.setup();
    renderRecipes(["/?q=soup", "/?q=pasta"]);
    const box = screen.getByLabelText("Search recipes by title");
    expect(box).toHaveValue("pasta");

    await user.click(screen.getByRole("button", { name: "history back" }));
    await waitFor(() => expect(box).toHaveValue("soup"));
    expect(await screen.findByRole("heading", { name: "Soup 1" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "history forward" }));
    await waitFor(() => expect(box).toHaveValue("pasta"));
  });

  it("clears the box when Back lands on a URL with no search", async () => {
    const user = userEvent.setup();
    renderRecipes(["/", "/?q=soup"]);
    const box = screen.getByLabelText("Search recipes by title");
    expect(box).toHaveValue("soup");

    await user.click(screen.getByRole("button", { name: "history back" }));

    await waitFor(() => expect(box).toHaveValue(""));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
  });

  it("leaves the box alone while the user types, even after the search reaches the URL", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRecipes();
    await screen.findByRole("heading", { name: "Recipe 1" });
    const box = screen.getByLabelText("Search recipes by title");

    await user.type(box, "soup ");
    await act(async () => {
      vi.advanceTimersByTime(RECIPE_SEARCH_DEBOUNCE_MS);
    });

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/?q=soup"));
    expect(box).toHaveValue("soup ");
  });

  it("says so when My recipes is empty and Show all recipes clears the filter", async () => {
    const user = userEvent.setup();
    respond = (config) =>
      config.params?.owner === "me"
        ? { status: 200, data: pageAfter(undefined, 0) }
        : { status: 200, data: pageAfter(undefined, 2) };
    renderRecipes("/?owner=me");

    expect(await screen.findByRole("heading", { name: RECIPES_MINE_EMPTY_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(RECIPES_MINE_EMPTY_COPY.body)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No recipes yet" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: RECIPES_MINE_EMPTY_COPY.actionLabel }));

    expect(await screen.findByRole("heading", { name: "Recipe 1" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
    expect(screen.getByRole("button", { name: "My recipes" })).toHaveAttribute("aria-pressed", "false");
  });
});
