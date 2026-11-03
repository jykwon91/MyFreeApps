import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Animated, StyleSheet } from "react-native";
import Skeleton from "../components/Skeleton";

describe("Skeleton", () => {
  it("applies the requested size", async () => {
    await render(<Skeleton height={24} testID="skeleton" width={120} />);

    const style = StyleSheet.flatten(
      screen.getByTestId("skeleton", { includeHiddenElements: true }).props.style,
    );
    expect(style.width).toBe(120);
    expect(style.height).toBe(24);
  });

  it("is hidden from screen readers", async () => {
    await render(<Skeleton testID="skeleton" />);

    expect(screen.queryByTestId("skeleton")).toBeNull();
    expect(screen.getByTestId("skeleton", { includeHiddenElements: true })).toBeTruthy();
  });

  describe("pulsing", () => {
    function spyOnLoop() {
      const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
      const loop = jest.spyOn(Animated, "loop").mockReturnValue(animation);
      return { animation, loop };
    }

    afterEach(() => jest.restoreAllMocks());

    it("pulses, and stops when unmounted", async () => {
      jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
      const { animation, loop } = spyOnLoop();

      const { unmount } = await render(<Skeleton />);
      expect(loop).toHaveBeenCalledTimes(1);
      expect(animation.start).toHaveBeenCalledTimes(1);

      await unmount();
      expect(animation.stop).toHaveBeenCalledTimes(1);
    });

    it("doesn't pulse with reduce motion on", async () => {
      jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
      const { animation } = spyOnLoop();

      await render(<Skeleton />);

      expect(animation.start).not.toHaveBeenCalled();
    });

    it("doesn't pulse before it knows the setting", async () => {
      jest
        .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
        .mockReturnValue(new Promise<boolean>(() => undefined));
      const { animation } = spyOnLoop();

      await render(<Skeleton />);

      expect(animation.start).not.toHaveBeenCalled();
    });

    it("follows the setting when it changes", async () => {
      jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
      const remove = jest.fn();
      const listen = jest
        .spyOn(AccessibilityInfo, "addEventListener")
        .mockReturnValue({ remove } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>);
      // This module is already a mock, so the spy has calls left by earlier tests.
      listen.mockClear();
      const { animation } = spyOnLoop();

      const { unmount } = await render(<Skeleton />);
      expect(animation.start).toHaveBeenCalledTimes(1);

      const call = listen.mock.calls.find(([event]) => event === "reduceMotionChanged");
      const onChange = call?.[1] as unknown as (enabled: boolean) => void;
      await act(async () => onChange(true));
      expect(animation.stop).toHaveBeenCalledTimes(1);

      await act(async () => onChange(false));
      expect(animation.start).toHaveBeenCalledTimes(2);

      await unmount();
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });
});
