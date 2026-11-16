import { DEFAULT_REQUEST_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { assertSecureApiUrl, clearDataExportFiles, onAccountLeft, resetCacheOnAccountChange } from "@platform/mobile";
import { configureStore } from "@reduxjs/toolkit";
import { API_BASE_URL } from "../constants/api";
import { clearCookCopies } from "../features/cook/cookCopies";
import cookSessions, { sessionsCleared } from "../features/cook/cookSessionsSlice";
import cookTimers, { timersCleared } from "../features/cook/cookTimersSlice";
import discovery, { discoveryCleared } from "../features/discovery/discoverySlice";
import { cancelAllCookTimerAlerts } from "../services/cookTimerNotifications";
import { session } from "./session";

assertSecureApiUrl(API_BASE_URL);

// Requests throw until the platform is configured, and nothing sends one without the store.
configurePlatform({
  baseURL: API_BASE_URL,
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  tokenStore: session.tokenStore,
  orgStore: { get: () => null },
  isOnLogin: () => false,
  refreshSession: session.refreshSession,
  currentAccount: session.currentAccount,
});

export function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer, cookSessions, cookTimers, discovery },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export const store = makeStore();

resetCacheOnAccountChange(session, () => store.dispatch(baseApi.util.resetApiState()));

// What one account leaves on the phone that the next shouldn't see: a timer's alert names the
// recipe, a data export on the way to the share sheet is the whole account, and recipes saved for
// cooking offline are theirs too.
onAccountLeft(session, () => {
  clearDataExportFiles();
  clearCookCopies();
  store.dispatch(timersCleared());
  store.dispatch(sessionsCleared());
  store.dispatch(discoveryCleared());
  void cancelAllCookTimerAlerts();
});

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof store.getState>;
