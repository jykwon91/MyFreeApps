import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { useReduceMotion, useScreenReaderEnabled } from "../index";

describe("useScreenReaderEnabled", () => {
  it("starts unknown, reads the setting, and follows changes", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
    const remove = jest.fn();
    let notify: (enabled: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((_: string, listener: (enabled: boolean) => void) => {
      notify = listener;
      return { remove };
    }) as never);

    const { result, unmount } = await renderHook(() => useScreenReaderEnabled());
    await waitFor(() => expect(result.current).toBe(true));

    await act(async () => notify(false));
    expect(result.current).toBe(false);

    await unmount();
    expect(remove).toHaveBeenCalled();
  });

  it("doesn't let a slow first read overwrite a newer change", async () => {
    let finishRead: (enabled: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockReturnValue(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    let notify: (enabled: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((_: string, listener: (enabled: boolean) => void) => {
      notify = listener;
      return { remove: jest.fn() };
    }) as never);

    const { result } = await renderHook(() => useScreenReaderEnabled());
    await act(async () => notify(true));
    await act(async () => finishRead(false));

    expect(result.current).toBe(true);
  });

  it("stays unknown if the setting can't be read", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockRejectedValue(new Error("unavailable"));

    const { result } = await renderHook(() => useScreenReaderEnabled());
    await act(async () => {});

    expect(result.current).toBeNull();
  });
});

describe("useReduceMotion", () => {
  it("reads the reduce-motion setting and follows its own event", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const listen = jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: jest.fn() } as never);

    const { result } = await renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(true));
    expect(listen).toHaveBeenCalledWith("reduceMotionChanged", expect.any(Function));
  });
});
