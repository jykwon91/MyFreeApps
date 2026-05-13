/**
 * Tauri runtime detection + thin IPC wrapper.
 *
 * The same React SPA ships to:
 *   1. The web deploy (Caddy serves the bundle from `dist/`).
 *   2. The Tauri desktop binary (system webview loads the same bundle).
 *
 * Pure runtime detection — we DO NOT bundle `@tauri-apps/api/core` into the
 * web build. Anything that needs to call into Tauri must:
 *   - Check `isTauri()` first.
 *   - Use `invokeTauri()` (dynamic-imported) rather than the raw API.
 *
 * Why dynamic import: the web bundle is the same bundle that ships to Tauri.
 * Static-importing `@tauri-apps/api` would pull a few KB of glue into every
 * web user's bundle for code that never runs on the web. Dynamic import keeps
 * the web payload identical to what PRs 1-6 shipped.
 */

/**
 * True when running inside the Tauri desktop binary.
 *
 * Tauri injects `window.__TAURI_INTERNALS__` before the bundle's first script
 * runs, so this is safe to call at module-evaluation time.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

/**
 * Invoke a Tauri IPC command.
 *
 * Safe to call from web code — if `isTauri()` is false, throws synchronously
 * so callers detect their bug at the call site rather than getting a
 * confusing "cannot read property of undefined" later.
 *
 * @param cmd  Name of the Rust `#[tauri::command]` to invoke.
 * @param args Optional payload (must be JSON-serializable).
 */
export async function invokeTauri<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    throw new Error(
      `invokeTauri("${cmd}") called outside Tauri — guard with isTauri() first`,
    );
  }
  // Dynamic import so this dependency doesn't ship in the web bundle.
  // The path is statically analyzable so the bundler creates a separate chunk
  // that's loaded only on demand.
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}
