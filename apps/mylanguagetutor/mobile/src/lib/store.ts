import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { assertSecureApiUrl, refetchOnForeground, resetCacheOnAccountChange } from "@platform/mobile";
import { configureStore } from "@reduxjs/toolkit";
import { API_BASE_URL } from "../constants/api";
import { session } from "./session";

assertSecureApiUrl(API_BASE_URL);

// Requests throw until the platform is configured, and nothing sends one without the store.
configurePlatform({
  baseURL: API_BASE_URL,
  tokenStore: session.tokenStore,
  orgStore: { get: () => null },
  isOnLogin: () => false,
  refreshSession: session.refreshSession,
  currentAccount: session.currentAccount,
});

export function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export const store = makeStore();

// Practice happens on the website, so coming back to the app should show fresh usage.
refetchOnForeground(store.dispatch);

resetCacheOnAccountChange(session, () => store.dispatch(baseApi.util.resetApiState()));

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof store.getState>;
