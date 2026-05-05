import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePhotoSelection } from "@/app/features/listings/usePhotoSelection";

const ORDERED = ["a", "b", "c", "d", "e"];

describe("usePhotoSelection", () => {
  it("starts with nothing selected", () => {
    const { result } = renderHook(() => usePhotoSelection());
    expect(result.current.selection.selectedIds.size).toBe(0);
    expect(result.current.selection.lastSelectedId).toBeNull();
  });

  it("toggles a single photo on (no shift)", () => {
    const { result } = renderHook(() => usePhotoSelection());
    act(() => {
      result.current.toggleSelection("b", false, ORDERED);
    });
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.selection.lastSelectedId).toBe("b");
  });

  it("toggles a selected photo off", () => {
    const { result } = renderHook(() => usePhotoSelection());
    act(() => {
      result.current.toggleSelection("b", false, ORDERED);
    });
    act(() => {
      result.current.toggleSelection("b", false, ORDERED);
    });
    expect(result.current.isSelected("b")).toBe(false);
  });

  it("range-selects with shift from anchor to target", () => {
    const { result } = renderHook(() => usePhotoSelection());
    // Click "a" (anchor)
    act(() => {
      result.current.toggleSelection("a", false, ORDERED);
    });
    // Shift-click "c" → selects a, b, c
    act(() => {
      result.current.toggleSelection("c", true, ORDERED);
    });
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.isSelected("c")).toBe(true);
    expect(result.current.isSelected("d")).toBe(false);
  });

  it("range-selects works when target is before anchor", () => {
    const { result } = renderHook(() => usePhotoSelection());
    // Click "d" (anchor)
    act(() => {
      result.current.toggleSelection("d", false, ORDERED);
    });
    // Shift-click "b" → selects b, c, d
    act(() => {
      result.current.toggleSelection("b", true, ORDERED);
    });
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.isSelected("c")).toBe(true);
    expect(result.current.isSelected("d")).toBe(true);
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.isSelected("e")).toBe(false);
  });

  it("shift-click with no prior selection falls back to single toggle", () => {
    const { result } = renderHook(() => usePhotoSelection());
    act(() => {
      result.current.toggleSelection("c", true, ORDERED);
    });
    expect(result.current.isSelected("c")).toBe(true);
    expect(result.current.selection.selectedIds.size).toBe(1);
  });

  it("selectAll selects every id and sets lastSelectedId to the last", () => {
    const { result } = renderHook(() => usePhotoSelection());
    act(() => {
      result.current.selectAll(ORDERED);
    });
    for (const id of ORDERED) {
      expect(result.current.isSelected(id)).toBe(true);
    }
    expect(result.current.selection.lastSelectedId).toBe("e");
  });

  it("clearSelection removes all selections", () => {
    const { result } = renderHook(() => usePhotoSelection());
    act(() => {
      result.current.selectAll(ORDERED);
    });
    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selection.selectedIds.size).toBe(0);
  });

  it("maintains previously-selected items when adding a range", () => {
    const { result } = renderHook(() => usePhotoSelection());
    // Select "e" independently
    act(() => {
      result.current.toggleSelection("e", false, ORDERED);
    });
    // Then click "a" (no shift, new anchor)
    act(() => {
      result.current.toggleSelection("a", false, ORDERED);
    });
    // Shift-click "c" → range a-c added; "e" was already selected so it stays
    act(() => {
      result.current.toggleSelection("c", true, ORDERED);
    });
    expect(result.current.isSelected("e")).toBe(true);
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.isSelected("c")).toBe(true);
  });
});
