import { render, screen } from "@testing-library/react-native";
import { Animated, StyleSheet } from "react-native";
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

  it("stops pulsing when unmounted", async () => {
    const stop = jest.fn();
    const loop = jest
      .spyOn(Animated, "loop")
      .mockReturnValue({ start: jest.fn(), stop, reset: jest.fn() });

    const { unmount } = await render(<Skeleton />);
    expect(loop).toHaveBeenCalledTimes(1);

    await unmount();
    expect(stop).toHaveBeenCalledTimes(1);
    loop.mockRestore();
  });
});
