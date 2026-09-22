/**
 * localStorage JSON helpers that never throw.
 *
 * Storage can be unavailable (private mode, disabled cookies, quota) or hold a
 * value from an older version; either way the page must keep working, so reads
 * fall back to the default and writes fail silently (the setting just won't
 * persist). Values are validated by the caller's `parse`.
 */
export function readStored<T>(key: string, parse: (raw: unknown) => T | null, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return parse(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full — the setting just won't survive a reload.
  }
}

export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable — nothing to remove.
  }
}
