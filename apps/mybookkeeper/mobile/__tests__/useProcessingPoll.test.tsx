import { act, renderHook } from "@testing-library/react-native";
import { POLL_GIVE_UP_MS, POLL_INTERVAL_MS } from "../src/constants/documents";
import { useProcessingPoll } from "../src/features/documents/useProcessingPoll";

let mockBlur: (() => void) | undefined;
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      mockBlur = callback();
    }, [callback]);
  },
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("useProcessingPoll", () => {
  it("doesn't poll when nothing is being read", async () => {
    const { result } = await renderHook(() => useProcessingPoll(false));
    expect(result.current).toEqual({ pollingInterval: 0, gaveUp: false });
  });

  it("polls while something is being read, then gives up", async () => {
    const { result } = await renderHook(() => useProcessingPoll(true));
    expect(result.current.pollingInterval).toBe(POLL_INTERVAL_MS);
    await act(async () => {
      jest.advanceTimersByTime(POLL_GIVE_UP_MS);
    });
    expect(result.current).toEqual({ pollingInterval: 0, gaveUp: true });
  });

  it("stops polling when the screen isn't showing", async () => {
    const { result } = await renderHook(() => useProcessingPoll(true));
    await act(async () => {
      mockBlur?.();
    });
    expect(result.current.pollingInterval).toBe(0);
  });
});
