import { configureStore } from "@reduxjs/toolkit";
import { baseApi, onAccountLeft } from "@platform/ui";
import discovery, { discoveryCleared } from "@myrecipes/api-client/store/discoverySlice";

export function makeStore() {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      discovery,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export const store = makeStore();

// What Discover found and read belongs to the account that searched: the next one starts clean.
const stopClearingDiscovery = onAccountLeft(() => store.dispatch(discoveryCleared()));
// Hot reload runs this module again; drop the old store's listener so it doesn't stay registered.
import.meta.hot?.dispose(stopClearingDiscovery);

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
