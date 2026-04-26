import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDismissable } from "@/shared/hooks/useDismissable";

describe("useDismissable", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts dismissed=false when localStorage is empty", () => {
    const { result } = renderHook(() => useDismissable("test-key"));
    expect(result.current.dismissed).toBe(false);
  });

  it("starts dismissed=true when localStorage has the key set to '1'", () => {
    localStorage.setItem("test-key", "1");
    const { result } = renderHook(() => useDismissable("test-key"));
    expect(result.current.dismissed).toBe(true);
  });

  it("dismiss() sets dismissed=true and persists to localStorage", () => {
    const { result } = renderHook(() => useDismissable("test-key"));
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.dismissed).toBe(true);
    expect(localStorage.getItem("test-key")).toBe("1");
  });

  it("reset() sets dismissed=false and removes from localStorage", () => {
    localStorage.setItem("test-key", "1");
    const { result } = renderHook(() => useDismissable("test-key"));
    act(() => {
      result.current.reset();
    });
    expect(result.current.dismissed).toBe(false);
    expect(localStorage.getItem("test-key")).toBeNull();
  });

  it("uses different storage keys independently", () => {
    localStorage.setItem("key-a", "1");
    const { result: resultA } = renderHook(() => useDismissable("key-a"));
    const { result: resultB } = renderHook(() => useDismissable("key-b"));
    expect(resultA.current.dismissed).toBe(true);
    expect(resultB.current.dismissed).toBe(false);
  });
});
