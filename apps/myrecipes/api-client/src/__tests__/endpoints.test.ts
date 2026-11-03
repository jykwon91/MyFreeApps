import { configureStore } from "@reduxjs/toolkit";
import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import discoveryApi from "../store/discoveryApi";
import { recipesApi } from "../store/recipesApi";

const seen: InternalAxiosRequestConfig[] = [];
const recordingAdapter: AxiosAdapter = async (config) => {
  seen.push(config);
  return { data: [], status: 200, statusText: "OK", headers: {}, config };
};

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

function lastRequest(): InternalAxiosRequestConfig {
  const request = seen[seen.length - 1];
  if (!request) throw new Error("no request was sent");
  return request;
}

describe("the recipe endpoints", () => {
  let store: ReturnType<typeof makeStore>;

  beforeAll(() => {
    configurePlatform({
      baseURL: "https://api.test",
      tokenStore: { get: () => null, set: () => {}, clear: () => {} },
      orgStore: { get: () => null },
      isOnLogin: () => false,
    });
    api.defaults.adapter = recordingAdapter;
  });

  beforeEach(() => {
    seen.length = 0;
    store = makeStore();
  });

  it("sends only the list filters it was given", async () => {
    await store.dispatch(recipesApi.endpoints.listRecipes.initiate());
    expect(lastRequest().url).toBe("/recipes");
    expect(lastRequest().params).toBeUndefined();

    await store.dispatch(
      recipesApi.endpoints.listRecipes.initiate({ search: "soup", owner: "me" }),
    );
    expect(lastRequest().params).toEqual({ search: "soup", owner: "me" });
  });

  it("refetches the list after a recipe is created", async () => {
    await store.dispatch(recipesApi.endpoints.listRecipes.initiate());
    const before = seen.filter((r) => r.method === "get").length;

    await store.dispatch(recipesApi.endpoints.createRecipe.initiate({} as never));
    await Promise.all(store.dispatch(baseApi.util.getRunningQueriesThunk()));

    expect(seen.filter((r) => r.method === "get").length).toBe(before + 1);
  });

  it("logs a cook against the version that was cooked", async () => {
    await store.dispatch(
      recipesApi.endpoints.logCook.initiate({
        recipeId: "r1",
        versionId: "v2",
        body: {} as never,
      }),
    );
    expect(lastRequest().method).toBe("post");
    expect(lastRequest().url).toBe("/recipes/r1/versions/v2/cooks");
  });

  it("wraps a discovery search in the body the backend reads", async () => {
    await store.dispatch(discoveryApi.endpoints.searchWebRecipes.initiate("ramen"));
    expect(lastRequest().url).toBe("/discovery/search");
    expect(JSON.parse(String(lastRequest().data))).toEqual({ query: "ramen" });
  });
});
