import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useControllableState } from "../hooks/useControllableState";

describe("useControllableState", () => {
  it("owns the value when uncontrolled and reports each change", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllableState<number>({ value: undefined, defaultValue: 1, onChange }),
    );
    expect(result.current[0]).toBe(1);

    act(() => result.current[1]((prev) => prev + 1));
    expect(result.current[0]).toBe(2);
    expect(onChange).toHaveBeenLastCalledWith(2);

    act(() => result.current[1](10));
    expect(result.current[0]).toBe(10);
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it("only reports changes when controlled, resolving updaters against the controlled value", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => useControllableState<number>({ value, defaultValue: 0, onChange }),
      { initialProps: { value: 5 } },
    );
    act(() => result.current[1]((prev) => prev + 1));
    expect(onChange).toHaveBeenLastCalledWith(6);
    expect(result.current[0]).toBe(5);

    rerender({ value: 6 });
    expect(result.current[0]).toBe(6);
  });
});
