/**
 * Web Storage access that never throws.
 *
 * Touching `window.localStorage` / `window.sessionStorage` throws a
 * SecurityError when the browser blocks storage for the page — notably Chrome
 * with third-party cookies blocked (the default in every Incognito window)
 * while the app runs inside a third-party iframe such as a Discord Activity —
 * and `setItem` throws a QuotaExceededError when storage is full. Both are
 * expected environmental conditions, not bugs: "storage unavailable" means
 * exactly "nothing stored", so callers degrade to the signed-out / default
 * experience instead of crashing on their first read.
 */

type StorageArea = "localStorage" | "sessionStorage";

function storageArea(area: StorageArea): Storage | null {
  try {
    return window[area];
  } catch {
    return null;
  }
}

function readItem(area: StorageArea, key: string): string | null {
  try {
    return storageArea(area)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeItem(area: StorageArea, key: string, value: string): void {
  try {
    storageArea(area)?.setItem(key, value);
  } catch {
    // Blocked or full — the value won't survive a reload, nothing else changes.
  }
}

function removeItem(area: StorageArea, key: string): void {
  try {
    storageArea(area)?.removeItem(key);
  } catch {
    // Blocked — nothing was persisted.
  }
}

/** The stored value, or `null` when absent or when storage is unavailable. */
export function readLocalStorage(key: string): string | null {
  return readItem("localStorage", key);
}

/** Persist `value`; a blocked or full store just means it isn't kept. */
export function writeLocalStorage(key: string, value: string): void {
  writeItem("localStorage", key, value);
}

/** Remove `key`; a blocked store has nothing persisted to remove. */
export function removeLocalStorage(key: string): void {
  removeItem("localStorage", key);
}

/** Tab-scoped read — `null` when absent or when storage is unavailable. */
export function readSessionStorage(key: string): string | null {
  return readItem("sessionStorage", key);
}

/** Tab-scoped write; a blocked or full store just means it isn't kept. */
export function writeSessionStorage(key: string, value: string): void {
  writeItem("sessionStorage", key, value);
}
