import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import { resetTrackedStores } from "../../test-support/resetApiStateAfterAll";

const probeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({ probe: build.query<string, void>({ queryFn: () => ({ data: "kept" }) }) }),
});

// The setup file every jest config lists hooks the real baseApi. If something stopped that, for
// instance a test file mocking baseApi itself, stores would go untracked and leak without a sound.
it("tracks a store built from the real baseApi, and resets it", async () => {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  await store.dispatch(probeApi.endpoints.probe.initiate());
  expect(Object.keys(store.getState()[baseApi.reducerPath].queries)).not.toHaveLength(0);

  expect(resetTrackedStores()).toBe(true);

  expect(Object.keys(store.getState()[baseApi.reducerPath].queries)).toHaveLength(0);
});
