import jobAnalysisReducer from "@myjobhunter/api-client/store/jobAnalysisSlice";
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
    // The last analysis is kept, as on the website, so leaving the Analyze screen and coming back
    // doesn't pay for a second one. Resetting the API cache empties it too.
    reducer: { [baseApi.reducerPath]: baseApi.reducer, jobAnalysis: jobAnalysisReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export const store = makeStore();
// Queries that ask for it, such as the board's stage ages, refetch when the app comes back to the foreground.
refetchOnForeground(store.dispatch);

// The analysis slice resets with the API cache, so the next account never sees the last one's.
resetCacheOnAccountChange(session, () => store.dispatch(baseApi.util.resetApiState()));

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = AppStore["dispatch"];
