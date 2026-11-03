import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import { API_BASE_URL } from "../constants/api";
import cookSessions from "../features/cook/cookSessionsSlice";
import cookTimers from "../features/cook/cookTimersSlice";

// Requests throw until the platform is configured, and nothing sends one without the
// store. Signing in comes with the backend's mobile token work, so there's no token yet.
configurePlatform({
  baseURL: API_BASE_URL,
  tokenStore: { get: () => null, set: () => {}, clear: () => {} },
  orgStore: { get: () => null },
  isOnLogin: () => false,
});

export function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer, cookSessions, cookTimers },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof store.getState>;
