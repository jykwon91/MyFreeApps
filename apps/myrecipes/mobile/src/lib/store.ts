import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { assertSecureApiUrl, onAccountLeft, resetCacheOnAccountChange } from "@platform/mobile";
import { configureStore } from "@reduxjs/toolkit";
import { API_BASE_URL } from "../constants/api";
import cookSessions, { sessionsCleared } from "../features/cook/cookSessionsSlice";
import cookTimers, { timersCleared } from "../features/cook/cookTimersSlice";
import { cancelAllCookTimerAlerts } from "../services/cookTimerNotifications";
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
    reducer: { [baseApi.reducerPath]: baseApi.reducer, cookSessions, cookTimers },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export const store = makeStore();

resetCacheOnAccountChange(session, () => store.dispatch(baseApi.util.resetApiState()));

// A timer's alert names the recipe, so it shouldn't go off for the next person.
onAccountLeft(session, () => {
  store.dispatch(timersCleared());
  store.dispatch(sessionsCleared());
  void cancelAllCookTimerAlerts();
});

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof store.getState>;
