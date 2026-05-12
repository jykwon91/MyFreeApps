/**
 * Unit tests for useMapKeyboardShortcuts hook.
 *
 * Coverage:
 *  - Shortcut fires expected callback for "1", "2", "3"
 *  - Utility key "q" toggles first utility; "w" toggles second
 *  - "Escape" calls onCloseZonePanel when zone is open
 *  - "?" calls onToggleShortcutsHelp
 *  - NO fire when typing in an input element
 *  - NO fire when metaKey / ctrlKey is held
 */
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useMapKeyboardShortcuts } from "@/hooks/useMapKeyboardShortcuts";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function fireKey(key: string, options: Partial<KeyboardEventInit> = {}) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...options }),
    );
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const UTIL_OPTIONS = [
  { value: "smoke", label: "Smoke" },
  { value: "flash", label: "Flash" },
  { value: "molly", label: "Molly" },
];

type ShortcutOptions = Parameters<typeof useMapKeyboardShortcuts>[0];

/** Helper: render the hook + flush pending effects so the listener is registered. */
function setupHook(overrides: Partial<ShortcutOptions> = {}) {
  const defaults: ShortcutOptions = {
    utilOptions: UTIL_OPTIONS,
    selectedUtils: [],
    side: "any",
    zone: "",
    cardCount: 0,
    activeCardIndex: 0,
    onSideChange: vi.fn(),
    onUtilToggle: vi.fn(),
    onCloseZonePanel: vi.fn(),
    onActiveCardIndexChange: vi.fn(),
    onToggleShortcutsHelp: vi.fn(),
  };
  const merged = { ...defaults, ...overrides };
  renderHook(() => useMapKeyboardShortcuts(merged), { wrapper });
  // Flush pending useEffect so the document listener is registered
  act(() => {});
  return merged;
}

describe("useMapKeyboardShortcuts", () => {
  it("key '1' calls onSideChange with side_a", () => {
    const mocks = setupHook();
    fireKey("1");
    expect(mocks.onSideChange).toHaveBeenCalledWith("side_a");
  });

  it("key '2' calls onSideChange with side_b", () => {
    const mocks = setupHook();
    fireKey("2");
    expect(mocks.onSideChange).toHaveBeenCalledWith("side_b");
  });

  it("key '3' calls onSideChange with 'any'", () => {
    const mocks = setupHook({ side: "side_a" });
    fireKey("3");
    expect(mocks.onSideChange).toHaveBeenCalledWith("any");
  });

  it("key 'q' toggles first utility (adds smoke when not selected)", () => {
    const mocks = setupHook();
    fireKey("q");
    expect(mocks.onUtilToggle).toHaveBeenCalledWith(["smoke"]);
  });

  it("key 'q' removes smoke when already selected", () => {
    const mocks = setupHook({ selectedUtils: ["smoke"] });
    fireKey("q");
    expect(mocks.onUtilToggle).toHaveBeenCalledWith([]);
  });

  it("key 'w' toggles second utility (flash)", () => {
    const mocks = setupHook();
    fireKey("w");
    expect(mocks.onUtilToggle).toHaveBeenCalledWith(["flash"]);
  });

  it("Escape calls onCloseZonePanel when zone is open", () => {
    const mocks = setupHook({ zone: "a-site" });
    fireKey("Escape");
    expect(mocks.onCloseZonePanel).toHaveBeenCalled();
  });

  it("'?' calls onToggleShortcutsHelp", () => {
    const mocks = setupHook();
    fireKey("?");
    expect(mocks.onToggleShortcutsHelp).toHaveBeenCalled();
  });

  it("does NOT fire while focus is in an input", () => {
    const mocks = setupHook();

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "1", bubbles: true }),
      );
    });

    expect(mocks.onSideChange).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("does NOT fire when metaKey is held", () => {
    const mocks = setupHook();
    fireKey("1", { metaKey: true });
    expect(mocks.onSideChange).not.toHaveBeenCalled();
  });

  it("ArrowRight cycles to next card", () => {
    const mocks = setupHook({ zone: "a-site", cardCount: 3, activeCardIndex: 1 });
    fireKey("ArrowRight");
    expect(mocks.onActiveCardIndexChange).toHaveBeenCalledWith(2);
  });

  it("ArrowRight wraps around at last card", () => {
    const mocks = setupHook({ zone: "a-site", cardCount: 3, activeCardIndex: 2 });
    fireKey("ArrowRight");
    expect(mocks.onActiveCardIndexChange).toHaveBeenCalledWith(0);
  });
});
