import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMapTheaterMode } from "../useMapTheaterMode";
import { THEATER_MODE_STORAGE_KEY } from "@/games/wow-forever/data/worldMap/mapTheaterMode";

// ── localStorage stub ───────────────────────────────────────────────────────
const store: Record<string, string> = {};
const lsGetItem = vi.fn((key: string) => store[key] ?? null);
const lsSetItem = vi.fn((key: string, value: string) => { store[key] = value; });

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  lsGetItem.mockClear();
  lsSetItem.mockClear();
  vi.stubGlobal("localStorage", { getItem: lsGetItem, setItem: lsSetItem });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ── helpers ─────────────────────────────────────────────────────────────────
function makeRef(el: HTMLElement | null = null) {
  return { current: el };
}

// ── tests ────────────────────────────────────────────────────────────────────
describe("useMapTheaterMode", () => {
  it("initialises inactive when nothing is stored", () => {
    const { result } = renderHook(() => useMapTheaterMode(makeRef(), false));
    expect(result.current.active).toBe(false);
  });

  it("initialises active when localStorage holds 'true'", () => {
    store[THEATER_MODE_STORAGE_KEY] = "true";
    const { result } = renderHook(() => useMapTheaterMode(makeRef(), false));
    expect(result.current.active).toBe(true);
  });

  it("toggle flips from inactive → active", () => {
    const { result } = renderHook(() => useMapTheaterMode(makeRef(), false));
    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);
  });

  it("toggle flips from active → inactive", () => {
    store[THEATER_MODE_STORAGE_KEY] = "true";
    const { result } = renderHook(() => useMapTheaterMode(makeRef(), false));
    act(() => result.current.toggle());
    expect(result.current.active).toBe(false);
  });

  it("exit always sets active to false", () => {
    store[THEATER_MODE_STORAGE_KEY] = "true";
    const { result } = renderHook(() => useMapTheaterMode(makeRef(), false));
    act(() => result.current.exit());
    expect(result.current.active).toBe(false);
  });

  it("persists active state to localStorage on toggle", () => {
    const { result } = renderHook(() => useMapTheaterMode(makeRef(), false));
    act(() => result.current.toggle());
    expect(lsSetItem).toHaveBeenCalledWith(THEATER_MODE_STORAGE_KEY, "true");
    act(() => result.current.toggle());
    expect(lsSetItem).toHaveBeenCalledWith(THEATER_MODE_STORAGE_KEY, "false");
  });

  it("Esc exits theater when escapeTaken is false", () => {
    store[THEATER_MODE_STORAGE_KEY] = "true";
    const { result } = renderHook(() => useMapTheaterMode(makeRef(), false));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(result.current.active).toBe(false);
  });

  it("Esc does NOT exit theater when escapeTaken is true", () => {
    store[THEATER_MODE_STORAGE_KEY] = "true";
    const { result } = renderHook(() => useMapTheaterMode(makeRef(), true));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(result.current.active).toBe(true);
  });

  it("Esc does NOT exit when the event was already prevented", () => {
    store[THEATER_MODE_STORAGE_KEY] = "true";
    const { result } = renderHook(() => useMapTheaterMode(makeRef(), false));
    act(() => {
      const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      e.preventDefault();
      document.dispatchEvent(e);
    });
    expect(result.current.active).toBe(true);
  });

  it("non-Escape keys do not exit theater", () => {
    store[THEATER_MODE_STORAGE_KEY] = "true";
    const { result } = renderHook(() => useMapTheaterMode(makeRef(), false));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(result.current.active).toBe(true);
  });

  it("inerts surrounding elements when active and frame is set", () => {
    // Build a minimal DOM: body → outer → [frame, sibling]
    const outer = document.createElement("div");
    const frame = document.createElement("div");
    const sibling = document.createElement("div");
    outer.appendChild(frame);
    outer.appendChild(sibling);
    document.body.appendChild(outer);

    const ref = makeRef(frame);
    const { result } = renderHook(() => useMapTheaterMode(ref, false));

    act(() => result.current.toggle());
    expect(sibling.hasAttribute("inert")).toBe(true);

    act(() => result.current.toggle());
    expect(sibling.hasAttribute("inert")).toBe(false);

    document.body.removeChild(outer);
  });

  it("locks body scroll when active, restores on exit", () => {
    document.body.style.overflow = "";
    const frame = document.createElement("div");
    document.body.appendChild(frame);

    const ref = makeRef(frame);
    const { result } = renderHook(() => useMapTheaterMode(ref, false));

    act(() => result.current.toggle());
    expect(document.body.style.overflow).toBe("hidden");

    act(() => result.current.exit());
    expect(document.body.style.overflow).toBe("");

    document.body.removeChild(frame);
  });
});

describe("useMapTheaterMode beforeChange", () => {
  it("runs before every flip: toggle, exit and Esc — but not for a blocked Esc", () => {
    const before = vi.fn();
    const { result, rerender } = renderHook(({ taken }) => useMapTheaterMode(makeRef(), taken, before), {
      initialProps: { taken: false },
    });
    act(() => result.current.toggle());
    expect(before).toHaveBeenCalledTimes(1);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(before).toHaveBeenCalledTimes(2);
    expect(result.current.active).toBe(false);
    act(() => result.current.toggle());
    rerender({ taken: true });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(before).toHaveBeenCalledTimes(3);
    expect(result.current.active).toBe(true);
    act(() => result.current.exit());
    expect(before).toHaveBeenCalledTimes(4);
  });
});
