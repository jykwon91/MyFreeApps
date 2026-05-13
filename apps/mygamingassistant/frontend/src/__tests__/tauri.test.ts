/**
 * Unit tests for the Tauri runtime detection helper.
 *
 * Coverage:
 *  - isTauri() returns false in a stock jsdom environment (no injection)
 *  - isTauri() returns true when the Tauri internals object is present
 *  - invokeTauri() throws synchronously when called outside Tauri
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { invokeTauri, isTauri } from "@/lib/tauri";

function clearTauriInjection() {
  if ("__TAURI_INTERNALS__" in window) {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
}

describe("isTauri()", () => {
  beforeEach(clearTauriInjection);
  afterEach(clearTauriInjection);

  it("returns false in a plain jsdom environment", () => {
    expect(isTauri()).toBe(false);
  });

  it("returns true when __TAURI_INTERNALS__ is present on window", () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      // Tauri actually injects a non-trivial object here; tests don't care
      // about the shape, only the key's presence.
      invoke: () => undefined,
    };
    expect(isTauri()).toBe(true);
  });
});

describe("invokeTauri()", () => {
  beforeEach(clearTauriInjection);
  afterEach(clearTauriInjection);

  it("throws synchronously when called outside Tauri", async () => {
    await expect(invokeTauri("get_app_version")).rejects.toThrow(
      /outside Tauri/,
    );
  });
});
