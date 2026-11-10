import { renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { useDebouncedAnnouncement } from "../src/lib/useDebouncedAnnouncement";

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);

beforeEach(() => {
  jest.useFakeTimers();
  announce.mockClear();
});
afterEach(() => jest.useRealTimers());

describe("useDebouncedAnnouncement", () => {
  it("says the message once it has been still for the delay", async () => {
    await renderHook(() => useDebouncedAnnouncement("3 results", 500));
    jest.advanceTimersByTime(499);
    expect(announce).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(announce).toHaveBeenCalledWith("3 results");
  });

  it("says only the last message when it changes while waiting", async () => {
    const { rerender } = await renderHook((message: string) => useDebouncedAnnouncement(message, 500), { initialProps: "9 results" });
    jest.advanceTimersByTime(300);
    await rerender("2 results");
    jest.advanceTimersByTime(500);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("2 results");
  });

  it("says nothing without a message", async () => {
    await renderHook(() => useDebouncedAnnouncement(undefined, 500));
    jest.advanceTimersByTime(1000);
    expect(announce).not.toHaveBeenCalled();
  });
});
