import { configureStore } from "@reduxjs/toolkit";
import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RECIPES_PAGE_SIZE } from "../constants/recipesPaging";
import { recipesApi } from "../store/recipesApi";
import type { RecipeSummary } from "../types/recipe/recipe";
import type { RecipeListPage } from "../types/recipe/recipe-list-page";

type Reply = { status: number; data: unknown };

const sent: InternalAxiosRequestConfig[] = [];
let respond: (config: InternalAxiosRequestConfig) => Reply;

function summary(n: number): RecipeSummary {
  return {
    id: `r${n}`,
    title: `Recipe ${n}`,
    description: null,
    source: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    version_count: 1,
    latest_version_number: 1,
    is_owner: true,
    owner_display_name: "Sam",
    best_rating: null,
    last_cooked_at: null,
  };
}

/** The recipes at `offset` out of `total`, numbered from 1, one page's worth at most. */
function pageAt(offset: number, total: number): RecipeListPage {
  const count = Math.max(0, Math.min(RECIPES_PAGE_SIZE, total - offset));
  const items = Array.from({ length: count }, (_, i) => summary(offset + i + 1));
  return { items, total, has_more: offset + count < total };
}

function makeStore() {
  return configureStore({
    reducer: { [recipesApi.reducerPath]: recipesApi.reducer },
    middleware: (getDefault) => getDefault().concat(recipesApi.middleware),
  });
}

type Dispatch = ReturnType<typeof makeStore>["dispatch"];

const listGets = () => sent.filter((config) => config.method === "get" && config.url === "/recipes");

function loadedIds(store: ReturnType<typeof makeStore>, args: { search?: string; owner?: "me" }): string[] {
  const state = recipesApi.endpoints.listRecipes.select(args)(store.getState());
  return (state.data?.pages ?? []).flatMap((page) => page.items.map(({ id }) => id));
}

beforeAll(() => {
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: { get: () => null, set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = async (config) => {
    sent.push(config);
    const { status, data } = respond(config);
    return { data, status, statusText: "OK", headers: {}, config };
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  respond = (config) =>
    config.method === "get" && config.url === "/recipes"
      ? { status: 200, data: pageAt(Number(config.params?.offset ?? 0), 60) }
      : { status: 200, data: {} };
});

describe("the paged recipes list", () => {
  it("asks for the first page, with only the filters it was given", async () => {
    const store = makeStore();
    await store.dispatch(recipesApi.endpoints.listRecipes.initiate({}));
    expect(api.getUri(listGets()[0])).toBe(`https://api.test/recipes?limit=${RECIPES_PAGE_SIZE}&offset=0`);

    await store.dispatch(recipesApi.endpoints.listRecipes.initiate({ search: "soup", owner: "me" }));
    expect(listGets()[1]?.params).toEqual({ search: "soup", owner: "me", limit: RECIPES_PAGE_SIZE, offset: 0 });
  });

  it("loads the second page where the first ended, so recipe 51 and on show", async () => {
    const store = makeStore();
    await store.dispatch(recipesApi.endpoints.listRecipes.initiate({}));
    await store.dispatch(recipesApi.endpoints.listRecipes.initiate({}, { direction: "forward" }));

    expect(listGets().map((config) => config.params?.offset)).toEqual([0, RECIPES_PAGE_SIZE]);
    const ids = loadedIds(store, {});
    expect(ids).toHaveLength(60);
    expect(ids.slice(RECIPES_PAGE_SIZE, RECIPES_PAGE_SIZE + 1)).toEqual(["r51"]);
    expect(ids[ids.length - 1]).toBe("r60");
  });

  it("asks for no further page once every recipe is loaded", async () => {
    respond = () => ({ status: 200, data: pageAt(0, 3) });
    const store = makeStore();
    await store.dispatch(recipesApi.endpoints.listRecipes.initiate({}));
    await store.dispatch(recipesApi.endpoints.listRecipes.initiate({}, { direction: "forward" }));
    expect(listGets()).toHaveLength(1);
  });

  it("starts a new search from the first page", async () => {
    const store = makeStore();
    await store.dispatch(recipesApi.endpoints.listRecipes.initiate({}));
    await store.dispatch(recipesApi.endpoints.listRecipes.initiate({}, { direction: "forward" }));
    sent.length = 0;

    await store.dispatch(recipesApi.endpoints.listRecipes.initiate({ search: "soup" }));
    expect(listGets().map((config) => config.params)).toEqual([
      { search: "soup", owner: undefined, limit: RECIPES_PAGE_SIZE, offset: 0 },
    ]);
    expect(loadedIds(store, { search: "soup" })).toHaveLength(RECIPES_PAGE_SIZE);
  });

  it.each([
    ["creating a recipe", (dispatch: Dispatch) => dispatch(recipesApi.endpoints.createRecipe.initiate({} as never))],
    ["editing a recipe", (dispatch: Dispatch) => dispatch(recipesApi.endpoints.updateRecipe.initiate({ recipeId: "r1", body: {} }))],
    ["deleting a recipe", (dispatch: Dispatch) => dispatch(recipesApi.endpoints.deleteRecipe.initiate("r1"))],
    [
      "tweaking a recipe",
      (dispatch: Dispatch) => dispatch(recipesApi.endpoints.createVersion.initiate({ recipeId: "r1", body: {} as never })),
    ],
    [
      "restoring a version",
      (dispatch: Dispatch) => dispatch(recipesApi.endpoints.restoreVersion.initiate({ recipeId: "r1", versionId: "v1" })),
    ],
    [
      "logging a cook",
      (dispatch: Dispatch) =>
        dispatch(recipesApi.endpoints.logCook.initiate({ recipeId: "r1", versionId: "v1", body: {} as never })),
    ],
    [
      "deleting a cook",
      (dispatch: Dispatch) => dispatch(recipesApi.endpoints.deleteCook.initiate({ recipeId: "r1", cookId: "c1" })),
    ],
  ])("reloads every loaded page after %s", async (_name, mutate) => {
    const store = makeStore();
    const list = store.dispatch(recipesApi.endpoints.listRecipes.initiate({}));
    await list;
    await store.dispatch(recipesApi.endpoints.listRecipes.initiate({}, { direction: "forward" }));
    sent.length = 0;

    await mutate(store.dispatch);
    await Promise.all(store.dispatch(baseApi.util.getRunningQueriesThunk()));

    expect(listGets().map((config) => config.params?.offset)).toEqual([0, RECIPES_PAGE_SIZE]);
    list.unsubscribe();
  });
});
