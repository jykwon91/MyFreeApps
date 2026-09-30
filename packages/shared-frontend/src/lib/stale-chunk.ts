/**
 * Recovery for "stale chunk" failures after a deploy.
 *
 * Vite content-hashes every lazy chunk (`WowProfessionsPage-BY91k5ug.js`) and
 * a deploy replaces them. A tab opened BEFORE the deploy still runs the old
 * entry bundle, so the first time it navigates to a lazy route it asks for a
 * chunk that no longer exists and the dynamic `import()` rejects. The only
 * fix is to load the new build — i.e. reload the page.
 *
 * Installation (once, in each app's `main.tsx`, before rendering):
 *
 *   import { installStaleChunkRecovery } from "@platform/ui";
 *   installStaleChunkRecovery();
 *
 * Vite dispatches `vite:preloadError` on `window` whenever a dynamic import
 * (or one of its preloaded CSS/JS deps) fails —
 * https://vite.dev/guide/build#load-error-handling. The listener reloads the
 * page ONCE per path per {@link STALE_CHUNK_RELOAD_WINDOW_MS}. The guard lives
 * in sessionStorage so it survives the reload: if the chunk still fails right
 * after reloading (a real outage, not a stale tab), no second reload happens
 * and the error reaches the router's error UI, which offers a manual reload.
 * It can never loop.
 */

/** sessionStorage key prefix; the full key is `<prefix><pathname>`. */
export const STALE_CHUNK_RELOAD_KEY_PREFIX = "platform:stale-chunk-reload:";

/**
 * A second failure for the same path within this window after an automatic
 * reload means reloading didn't help — stop and show the manual prompt.
 */
export const STALE_CHUNK_RELOAD_WINDOW_MS = 60_000;

const VITE_PRELOAD_ERROR_EVENT = "vite:preloadError";

// Messages browsers + Vite use when a dynamic import or its preload fails:
//   Chromium: "Failed to fetch dynamically imported module: <url>"
//   Firefox:  "error loading dynamically imported module: <url>"
//   Safari:   "Importing a module script failed."
//   Vite:     "Unable to preload CSS for <url>"
const CHUNK_LOAD_ERROR_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i;

export interface StaleChunkReloadDeps {
  /** Where the once-per-path guard is stored. `null` = storage unavailable. */
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  pathname: string;
  now: number;
  reload: () => void;
}

let reloadScheduled = false;

/** True when `error` is a failed dynamic import / chunk preload. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return CHUNK_LOAD_ERROR_PATTERN.test(error.message);
}

/**
 * True once this module has triggered an automatic reload in the current
 * page. Error UIs use it to show "updating…" instead of a reload prompt for
 * the instant between the failure and the browser tearing the page down.
 */
export function isStaleChunkReloadScheduled(): boolean {
  return reloadScheduled;
}

function readSessionStorage(): Storage | null {
  // Accessing sessionStorage throws a SecurityError when storage is blocked
  // (some privacy modes / sandboxed iframes). Without storage the once-only
  // guard can't be kept, so the caller must not auto-reload at all.
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function defaultDeps(): StaleChunkReloadDeps {
  return {
    storage: readSessionStorage(),
    pathname: window.location.pathname,
    now: Date.now(),
    reload: () => window.location.reload(),
  };
}

/**
 * Reload the page to pick up a new deploy — at most once per path per
 * {@link STALE_CHUNK_RELOAD_WINDOW_MS}.
 *
 * Returns `true` when a reload was triggered, `false` when the guard (or
 * missing storage) prevented it and the caller should surface the error.
 */
export function reloadOnceForStaleChunk(deps: StaleChunkReloadDeps = defaultDeps()): boolean {
  const { storage, pathname, now, reload } = deps;
  if (storage === null) return false;

  const key = `${STALE_CHUNK_RELOAD_KEY_PREFIX}${pathname}`;
  const lastReloadAt = Number(storage.getItem(key));
  if (Number.isFinite(lastReloadAt) && now - lastReloadAt < STALE_CHUNK_RELOAD_WINDOW_MS) {
    return false;
  }

  try {
    storage.setItem(key, String(now));
  } catch {
    // Quota exceeded / storage revoked: the guard can't be persisted, so an
    // automatic reload could loop. Surface the error UI instead.
    return false;
  }
  reloadScheduled = true;
  reload();
  return true;
}

/**
 * Listen for Vite's `vite:preloadError` and reload once onto the new build.
 * Returns an uninstall function (used by tests; apps install for the page's
 * lifetime).
 *
 * The event is deliberately NOT `preventDefault()`-ed: Vite then re-throws
 * the original error, so if the guard declines to reload, the router's error
 * UI receives the real chunk error rather than a lazy() "resolved to
 * undefined" error.
 */
export function installStaleChunkRecovery(
  target: Window = window,
  reloadOnce: () => boolean = () => reloadOnceForStaleChunk(),
): () => void {
  const onPreloadError = (): void => {
    reloadOnce();
  };
  target.addEventListener(VITE_PRELOAD_ERROR_EVENT, onPreloadError);
  return () => target.removeEventListener(VITE_PRELOAD_ERROR_EVENT, onPreloadError);
}

/** Test-only: reset module state between tests. */
export function __resetStaleChunkStateForTests(): void {
  reloadScheduled = false;
}
