import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { assertSecureApiUrl, onAccountLeft, resetCacheOnAccountChange } from "@platform/mobile";
import { configureStore } from "@reduxjs/toolkit";
import { API_BASE_URL } from "../constants/api";
import { clearDocumentFiles } from "../features/documents/openDocumentFile";
import workspace, { workspaceChosen } from "../features/workspace/workspaceSlice";
import { session } from "./session";

assertSecureApiUrl(API_BASE_URL);

// Requests throw until the platform is configured, and nothing sends one without the store.
configurePlatform({
  baseURL: API_BASE_URL,
  tokenStore: session.tokenStore,
  orgStore: { get: () => store.getState().workspace.activeId },
  isOnLogin: () => false,
  refreshSession: session.refreshSession,
  currentAccount: session.currentAccount,
});

export function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer, workspace },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export const store = makeStore();

// In this order: a reset makes a mounted gate request again, and that request must not carry the old workspace.
onAccountLeft(session, () => {
  store.dispatch(workspaceChosen(null));
  clearDocumentFiles();
});
resetCacheOnAccountChange(session, () => store.dispatch(baseApi.util.resetApiState()));

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof store.getState>;
