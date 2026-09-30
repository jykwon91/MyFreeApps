/**
 * Regression tests for the post-deploy stale-chunk recovery.
 *
 * Bug: a tab opened before a deploy navigated to a lazy route after it and
 * died on "error loading dynamically imported module" — the old chunk was
 * gone. The recovery reloads ONCE per path per window; these tests pin the
 * "once" so a genuinely broken chunk can never trap a tab in a reload loop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STALE_CHUNK_RELOAD_KEY_PREFIX,
  STALE_CHUNK_RELOAD_WINDOW_MS,
  __resetStaleChunkStateForTests,
  installStaleChunkRecovery,
  isChunkLoadError,
  isStaleChunkReloadScheduled,
  reloadOnceForStaleChunk,
  type StaleChunkReloadDeps,
} from "../lib/stale-chunk";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

function deps(overrides: Partial<StaleChunkReloadDeps> = {}): StaleChunkReloadDeps {
  return {
    storage: memoryStorage(),
    pathname: "/wow-forever/professions",
    now: 1_000_000,
    reload: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => __resetStaleChunkStateForTests());

describe("isChunkLoadError", () => {
  it.each([
    // The exact prod message from the bug report (Firefox).
    "error loading dynamically imported module: https://mygamingassistant.myfreeapps.org/assets/WowProfessionsPage-BY91k5ug.js",
    "Failed to fetch dynamically imported module: https://x.test/assets/a-1234abcd.js",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/WowProfessionsPage-Cq1x2y3z.css",
  ])("recognises %s", (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it.each([
    new Error("Cannot read properties of undefined (reading 'map')"),
    new Error("Request failed with status code 500"),
    "error loading dynamically imported module", // not an Error instance
    null,
    undefined,
  ])("does not treat %s as a chunk error", (value) => {
    expect(isChunkLoadError(value)).toBe(false);
  });
});

describe("reloadOnceForStaleChunk", () => {
  it("reloads on the first failure and records the attempt for the path", () => {
    const d = deps();
    expect(reloadOnceForStaleChunk(d)).toBe(true);
    expect(d.reload).toHaveBeenCalledTimes(1);
    expect(d.storage?.getItem(`${STALE_CHUNK_RELOAD_KEY_PREFIX}/wow-forever/professions`)).toBe(
      "1000000",
    );
    expect(isStaleChunkReloadScheduled()).toBe(true);
  });

  it("does NOT reload again for the same path inside the window (no loop)", () => {
    const storage = memoryStorage();
    const first = deps({ storage });
    expect(reloadOnceForStaleChunk(first)).toBe(true);

    // The page reloaded, the chunk still fails a few seconds later.
    const second = deps({ storage, now: 1_000_000 + 5_000 });
    expect(reloadOnceForStaleChunk(second)).toBe(false);
    expect(second.reload).not.toHaveBeenCalled();
  });

  it("reloads again once the window has passed (a later deploy)", () => {
    const storage = memoryStorage();
    reloadOnceForStaleChunk(deps({ storage }));

    const later = deps({ storage, now: 1_000_000 + STALE_CHUNK_RELOAD_WINDOW_MS });
    expect(reloadOnceForStaleChunk(later)).toBe(true);
    expect(later.reload).toHaveBeenCalledTimes(1);
  });

  it("guards each path independently", () => {
    const storage = memoryStorage();
    reloadOnceForStaleChunk(deps({ storage }));

    const other = deps({ storage, pathname: "/wow-forever/map", now: 1_000_000 + 1_000 });
    expect(reloadOnceForStaleChunk(other)).toBe(true);
  });

  it("treats a corrupt stored value as no prior attempt", () => {
    const storage = memoryStorage();
    storage.setItem(`${STALE_CHUNK_RELOAD_KEY_PREFIX}/wow-forever/professions`, "not-a-number");
    expect(reloadOnceForStaleChunk(deps({ storage }))).toBe(true);
  });

  it("never auto-reloads when sessionStorage is unavailable (guard can't be kept)", () => {
    const d = deps({ storage: null });
    expect(reloadOnceForStaleChunk(d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("never auto-reloads when the guard can't be written", () => {
    const storage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    const d = deps({ storage });
    expect(reloadOnceForStaleChunk(d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });
});

describe("installStaleChunkRecovery", () => {
  let uninstall: (() => void) | undefined;
  afterEach(() => uninstall?.());

  it("attempts the guarded reload on vite:preloadError and leaves the event un-prevented", () => {
    const reloadOnce = vi.fn(() => true);
    uninstall = installStaleChunkRecovery(window, reloadOnce);

    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);

    expect(reloadOnce).toHaveBeenCalledTimes(1);
    // Not prevented: Vite re-throws the real chunk error, so if the guard
    // declines, the router error UI gets the chunk error (not "undefined").
    expect(event.defaultPrevented).toBe(false);
  });

  it("stops listening after uninstall", () => {
    const reloadOnce = vi.fn(() => true);
    installStaleChunkRecovery(window, reloadOnce)();

    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    expect(reloadOnce).not.toHaveBeenCalled();
  });
});
