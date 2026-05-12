import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createElement } from "react";
import { useSelectedYear } from "@/shared/hooks/useSelectedYear";

const CURRENT_YEAR = new Date().getFullYear();
const STORAGE_KEY = "mbk:selectedYear";

function wrapper(initialUrl = "/") {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [initialUrl] }, children);
}

describe("useSelectedYear", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to current year when no URL param and no storage", () => {
    const { result } = renderHook(() => useSelectedYear(), {
      wrapper: wrapper("/"),
    });

    expect(result.current[0]).toBe(CURRENT_YEAR);
  });

  it("reads year from URL param (URL wins over localStorage)", () => {
    localStorage.setItem(STORAGE_KEY, "2023");

    const { result } = renderHook(() => useSelectedYear(), {
      wrapper: wrapper("/?year=2024"),
    });

    expect(result.current[0]).toBe(2024);
  });

  it('reads "all" from URL param', () => {
    const { result } = renderHook(() => useSelectedYear(), {
      wrapper: wrapper("/?year=all"),
    });

    expect(result.current[0]).toBe("all");
  });

  it("reads year from localStorage when no URL param", () => {
    localStorage.setItem(STORAGE_KEY, "2023");

    const { result } = renderHook(() => useSelectedYear(), {
      wrapper: wrapper("/"),
    });

    expect(result.current[0]).toBe(2023);
  });

  it("falls back to current year on invalid URL param", () => {
    const { result } = renderHook(() => useSelectedYear(), {
      wrapper: wrapper("/?year=not-a-year"),
    });

    expect(result.current[0]).toBe(CURRENT_YEAR);
  });

  it("falls back to current year on out-of-range URL param", () => {
    const { result } = renderHook(() => useSelectedYear(), {
      wrapper: wrapper("/?year=1999"),
    });

    expect(result.current[0]).toBe(CURRENT_YEAR);
  });

  it("falls back to current year when localStorage has invalid value", () => {
    localStorage.setItem(STORAGE_KEY, "bogus");

    const { result } = renderHook(() => useSelectedYear(), {
      wrapper: wrapper("/"),
    });

    expect(result.current[0]).toBe(CURRENT_YEAR);
  });

  it("setSelectedYear writes to localStorage", () => {
    const { result } = renderHook(() => useSelectedYear(), {
      wrapper: wrapper("/"),
    });

    act(() => {
      result.current[1](2024);
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe("2024");
  });

  it('setSelectedYear writes "all" to localStorage', () => {
    const { result } = renderHook(() => useSelectedYear(), {
      wrapper: wrapper("/"),
    });

    act(() => {
      result.current[1]("all");
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe("all");
  });

  it("setSelectedYear updates the returned value", () => {
    const { result } = renderHook(() => useSelectedYear(), {
      wrapper: wrapper("/"),
    });

    act(() => {
      result.current[1](2022);
    });

    expect(result.current[0]).toBe(2022);
  });
});
