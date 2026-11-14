import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { assertSecureApiUrl, clearDataExportFiles, onAccountLeft, refetchOnForeground, resetCacheOnAccountChange } from "@platform/mobile";
import { configureStore } from "@reduxjs/toolkit";
import { API_BASE_URL } from "../constants/api";
import { stopAi } from "../features/aiPermission/aiPermission";
import { clearUploadQueue } from "../features/capture/uploadQueueFiles";
import uploads, { uploadsReset } from "../features/capture/uploadsSlice";
import { clearDocumentFiles } from "../features/documents/openDocumentFile";
import { clearReplyDrafts } from "../features/inquiries/replyDrafts";
import { clearReplyRequestIds } from "../features/inquiries/replyRequestIds";
import { clearSavedWorkspace } from "../features/workspace/savedWorkspace";
import workspace, { workspaceChosen, workspaceLost } from "../features/workspace/workspaceSlice";
import { clearHeldFiles } from "../features/uploads/heldFile";
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
    reducer: { [baseApi.reducerPath]: baseApi.reducer, uploads, workspace },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export const store = makeStore();
refetchOnForeground(store.dispatch);

// In this order: a reset makes a mounted gate request again, and that request must not carry the old workspace.
onAccountLeft(session, () => {
  store.dispatch(workspaceChosen(null));
  store.dispatch(workspaceLost(null));
  store.dispatch(uploadsReset());
  // Each has to run whatever the others do: these are someone's records. Nothing may
  // escape either, or the session's next listener, which clears the cache, never runs.
  for (const clear of [clearDocumentFiles, clearDataExportFiles, clearUploadQueue, clearReplyDrafts, clearReplyRequestIds, clearHeldFiles, clearSavedWorkspace, stopAi]) {
    try {
      clear();
    } catch (error) {
      console.error("Couldn't clear what the last account left on this phone", error);
    }
  }
});
resetCacheOnAccountChange(session, () => store.dispatch(baseApi.util.resetApiState()));

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
