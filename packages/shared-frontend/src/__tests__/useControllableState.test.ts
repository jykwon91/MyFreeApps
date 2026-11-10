import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useControllableState } from "../hooks/useControllableState";

interface HookProps {
  value: number | undefined;
}

function renderControllable(initialValue: number | undefined, onChange = vi.fn()) {
  const hook = renderHook(
    ({ value }: HookProps) => useControllableState<number>({ value, defaultValue: 1, onChange }),
    { initialProps: { value: initialValue } },
  );
  return { ...hook, onChange };
}

describe("useControllableState", () => {
  it("owns the value when uncontrolled and reports each change", () => {
    const { result, onChange } = renderControllable(undefined);
    expect(result.current[0]).toBe(1);

    act(() => result.current[1]((prev) => prev + 1));
    expect(result.current[0]).toBe(2);
    expect(onChange).toHaveBeenLastCalledWith(2);

    act(() => result.current[1](10));
    expect(result.current[0]).toBe(10);
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it("only reports changes when controlled, resolving updaters against the controlled value", () => {
    const { result, rerender, onChange } = renderControllable(5);
    act(() => result.current[1]((prev) => prev + 1));
    expect(onChange).toHaveBeenLastCalledWith(6);
    expect(result.current[0]).toBe(5);

    // The parent never applied 6, so the next update builds on 5 again.
    act(() => result.current[1]((prev) => prev + 1));
    expect(onChange).toHaveBeenLastCalledWith(6);

    rerender({ value: 6 });
    expect(result.current[0]).toBe(6);
  });

  it("chains two functional updates in one event when uncontrolled", () => {
    const { result, onChange } = renderControllable(undefined);
    act(() => {
      result.current[1]((prev) => prev + 1);
      result.current[1]((prev) => prev + 1);
    });
    expect(result.current[0]).toBe(3);
    expect(onChange.mock.calls).toEqual([[2], [3]]);
  });

  it("chains two functional updates in one event when controlled", () => {
    const { result, onChange } = renderControllable(5);
    act(() => {
      result.current[1]((prev) => prev + 1);
      result.current[1]((prev) => prev + 1);
    });
    expect(onChange.mock.calls).toEqual([[6], [7]]);
  });

  it("skips onChange when the next value is the current one", () => {
    const uncontrolled = renderControllable(undefined);
    act(() => uncontrolled.result.current[1](1));
    act(() => uncontrolled.result.current[1]((prev) => prev));
    expect(uncontrolled.onChange).not.toHaveBeenCalled();

    const controlled = renderControllable(5);
    act(() => controlled.result.current[1](5));
    expect(controlled.onChange).not.toHaveBeenCalled();
  });

  it("keeps the last controlled value when switched to uncontrolled", () => {
    const { result, rerender, onChange } = renderControllable(5);
    rerender({ value: 8 });
    rerender({ value: undefined });
    expect(result.current[0]).toBe(8);

    act(() => result.current[1]((prev) => prev + 1));
    expect(result.current[0]).toBe(9);
    expect(onChange).toHaveBeenLastCalledWith(9);
  });

  it("lets a controlled value take over from uncontrolled state", () => {
    const { result, rerender } = renderControllable(undefined);
    act(() => result.current[1](4));
    rerender({ value: 20 });
    expect(result.current[0]).toBe(20);
  });
});
