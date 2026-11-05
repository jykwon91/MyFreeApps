import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useTodayIso } from "../src/lib/useTodayIso";

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("moves to the new day when the app comes back after midnight", async () => {
  jest.useFakeTimers({ now: new Date(2026, 2, 10, 23, 0), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  const remove = jest.fn();
  const listeners: (() => void)[] = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    listeners.push(listener as () => void);
    return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
  });

  const { result, unmount } = await renderHook(() => useTodayIso());
  expect(result.current).toBe("2026-03-10");

  jest.setSystemTime(new Date(2026, 2, 11, 7, 0));
  await act(async () => listeners.forEach((listener) => listener()));
  expect(result.current).toBe("2026-03-11");

  await unmount();
  expect(remove).toHaveBeenCalled();
});
