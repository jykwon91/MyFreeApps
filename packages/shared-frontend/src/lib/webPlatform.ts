/**
 * Connects @platform/core to the browser. Every module here that re-exports
 * @platform/core behaviour imports this first, so the platform is configured
 * before any request can be made, whichever of them an app imports first.
 */
import { notifyAuthChange } from "@platform/core/lib/auth-store";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { readLocalStorage, removeLocalStorage } from "./safeStorage";

const TOKEN_KEY = "token";
const ACTIVE_ORG_KEY = "v1_activeOrgId";
const LOGIN_PATH = "/login";

// Storage goes through safeStorage: in a third-party iframe (a Discord Activity)
// a browser that blocks storage throws on access, and blocked storage has to read
// as signed out rather than fail every request.
configurePlatform({
  baseURL: "/api",
  tokenStore: {
    get: () => readLocalStorage(TOKEN_KEY),
    // Not safeStorage: a blocked or full store has to fail the sign-in.
    set: (token) => window.localStorage.setItem(TOKEN_KEY, token),
    clear: () => removeLocalStorage(TOKEN_KEY),
  },
  orgStore: {
    get: () => readLocalStorage(ACTIVE_ORG_KEY),
  },
  isOnLogin: () => window.location.pathname === LOGIN_PATH,
  onUnload: (listener) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  },
});

// Single shared storage-event handler so every subscriber reacts to cross-tab
// token changes without each hook instance attaching its own listener.
function handleStorageEvent(event: StorageEvent): void {
  // `event.key === null` means localStorage.clear() was called
  if (event.key === TOKEN_KEY || event.key === null) {
    notifyAuthChange();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", handleStorageEvent);
}
