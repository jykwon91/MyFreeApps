import { act, renderHook } from "@testing-library/react-native";
import { useRefresh } from "../hooks/useRefresh";

const failure = { status: "FETCH_ERROR" };
const otherFailure = { status: 500 };

describe("useRefresh", () => {
  it("has no error, and nothing to dismiss, while its query is fine", async () => {
    const { result } = await renderHook(() => useRefresh(jest.fn(), undefined));
    expect(result.current.hasError).toBe(false);
    expect(result.current.isErrorDismissed).toBe(true);
  });

  it("has an error when any of several queries failed, not only the first", async () => {
    const { result } = await renderHook(() => useRefresh(jest.fn(), [undefined, undefined, failure]));
    expect(result.current.hasError).toBe(true);
    expect(result.current.isErrorDismissed).toBe(false);
  });

  it("stays dismissed for the same failures and comes back for a new one", async () => {
    const { result, rerender } = await renderHook(({ errors }: { errors: unknown[] }) => useRefresh(jest.fn(), errors), {
      initialProps: { errors: [failure, undefined] },
    });
    await act(async () => result.current.dismissError());
    expect(result.current.isErrorDismissed).toBe(true);

    await rerender({ errors: [failure, undefined] });
    expect(result.current.isErrorDismissed).toBe(true);

    await rerender({ errors: [failure, otherFailure] });
    expect(result.current.isErrorDismissed).toBe(false);
    expect(result.current.hasError).toBe(true);
  });

  it("dismisses a single query's error as before", async () => {
    const { result } = await renderHook(() => useRefresh(jest.fn(), failure));
    expect(result.current.isErrorDismissed).toBe(false);
    await act(async () => result.current.dismissError());
    expect(result.current.isErrorDismissed).toBe(true);
  });

  it("refreshes by calling refetch, showing the spinner until it settles", async () => {
    let settle: () => void = () => undefined;
    const refetch = jest.fn(() => new Promise<void>((resolve) => { settle = resolve; }));
    const { result } = await renderHook(() => useRefresh(refetch, undefined));
    let refreshing: Promise<void> = Promise.resolve();
    await act(async () => { refreshing = result.current.refresh(); });
    expect(result.current.isRefreshing).toBe(true);
    await act(async () => { settle(); await refreshing; });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(false);
  });
});
