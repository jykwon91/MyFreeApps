import type { BuiltStores } from "./types/BuiltStores";
import type { ResettableApi } from "./types/ResettableApi";

// On globalThis so that jest.resetModules() or jest.isolateModules(), which load this file again,
// still find the stores the first copy saw instead of starting an empty list of their own.
const REGISTRY = Symbol.for("platform.mobile.test-support.builtStores");
const registry = globalThis as typeof globalThis & { [REGISTRY]?: BuiltStores };
const builtStores: BuiltStores = (registry[REGISTRY] ??= new Map());

/**
 * Makes every store built with these apis findable by `resetApiStateAfterAll`. A store passes
 * through its apis' middleware as it is built, so that is where it is noticed: the app's own, each
 * makeStore() a test calls, and any a test builds for itself.
 */
export function trackApiStores(apis: readonly ResettableApi[]): void {
  apis.forEach((api) => {
    if (builtStores.has(api)) return;
    const builtWith = api.middleware;
    builtStores.set(api, []);
    api.middleware = (store) => {
      builtStores.get(api)?.push(store);
      return builtWith(store);
    };
  });
}

/** Resets the API state of every tracked store. Returns whether there was one. */
export function resetTrackedStores(): boolean {
  let anyStore = false;
  builtStores.forEach((stores, api) => {
    stores.forEach((store) => store.dispatch(api.util.resetApiState()));
    anyStore ||= stores.length > 0;
    stores.length = 0;
  });
  return anyStore;
}

/**
 * Once a test file is done, resets the API state of every tracked store. That is what makes RTK
 * Query's middleware cancel the timers it keeps per store: the 60 second one that drops each unused
 * query result, and the polling ones. Left running, they outlive the file and keep its Jest worker
 * from exiting.
 */
export function resetApiStateAfterAll(): void {
  afterAll(async () => {
    // Real timers first: with a fake clock left on, the reset would cancel through the fake
    // clearTimeout and the real timers RTK Query started earlier would survive.
    jest.useRealTimers();
    if (!resetTrackedStores()) return;
    // Workaround for @reduxjs/toolkit 2.11.2: buildMiddleware/batchActions.ts sets updateSyncTimer to
    // null on resetApiState (about line 134) but never clears the 500 ms setTimeout it holds, and RTK
    // has no way to settle it. Left pending, it keeps the worker alive, so let it run out; it only
    // fires a harmless state update. Delete this wait once RTK clears that timer on reset.
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  });
}
