import { act, renderHook } from "@testing-library/react-native";
import { KEEP_AWAKE_IDLE_MS } from "../src/constants/conversation";
import { useAwakeUntilIdle } from "../src/hooks/useAwakeUntilIdle";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("useAwakeUntilIdle", () => {
  it("notes activity without re-rendering, and re-renders only when awake turns to idle and back", async () => {
    let renders = 0;
    const { result } = await renderHook(() => {
      renders += 1;
      return useAwakeUntilIdle(false);
    });
    const afterMount = renders;

    await act(async () => {
      for (let i = 0; i < 60; i += 1) {
        jest.advanceTimersByTime(16);
        result.current.onActivity();
      }
    });
    expect(renders).toBe(afterMount);

    await act(async () => jest.advanceTimersByTime(KEEP_AWAKE_IDLE_MS - 1));
    expect(result.current.awake).toBe(true);
    await act(async () => jest.advanceTimersByTime(1));
    expect(result.current.awake).toBe(false);

    await act(async () => result.current.onActivity());
    expect(result.current.awake).toBe(true);
    await act(async () => result.current.onActivity());
    expect(renders).toBe(afterMount + 2);
  });
});
