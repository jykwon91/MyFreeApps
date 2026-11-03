import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import Toast from "../components/Toast";
import { darkColors, lightColors } from "../theme/colors";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

const DISMISS = { name: "Dismiss notification" };

describe("Toast", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("announces the message", async () => {
    await render(<Toast message="Saved" onDismiss={jest.fn()} variant="success" />);

    expect(screen.getByRole("alert", { name: "Saved" })).toBeTruthy();
  });

  it("dismisses on press, with a touch target of at least the minimum", async () => {
    const onDismiss = jest.fn();
    await render(<Toast message="Saved" onDismiss={onDismiss} variant="success" />);
    const button = screen.getByRole("button", DISMISS);

    const style = StyleSheet.flatten(button.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(style.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

    await fireEvent.press(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses itself after the duration, and not before", async () => {
    const onDismiss = jest.fn();
    await render(<Toast durationMs={1000} message="Saved" onDismiss={onDismiss} variant="success" />);

    await act(async () => jest.advanceTimersByTime(999));
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("doesn't restart the countdown when the parent re-renders with a new onDismiss", async () => {
    const first = jest.fn();
    const latest = jest.fn();
    const { rerender } = await render(
      <Toast durationMs={1000} message="Saved" onDismiss={first} variant="success" />,
    );

    await act(async () => jest.advanceTimersByTime(600));
    await rerender(<Toast durationMs={1000} message="Saved" onDismiss={latest} variant="success" />);
    await act(async () => jest.advanceTimersByTime(400));

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("restarts the countdown for a new message", async () => {
    const onDismiss = jest.fn();
    const { rerender } = await render(
      <Toast durationMs={1000} message="One" onDismiss={onDismiss} variant="success" />,
    );

    await act(async () => jest.advanceTimersByTime(600));
    await rerender(<Toast durationMs={1000} message="Two" onDismiss={onDismiss} variant="success" />);
    await act(async () => jest.advanceTimersByTime(600));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("doesn't fire after unmount", async () => {
    const onDismiss = jest.fn();
    const { unmount } = await render(
      <Toast durationMs={1000} message="Saved" onDismiss={onDismiss} variant="success" />,
    );

    await unmount();
    await act(async () => jest.advanceTimersByTime(2000));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("colors the two variants differently", async () => {
    expect(lightColors.toastErrorBackground).not.toBe(lightColors.toastSuccessBackground);
    expect(darkColors.toastErrorBackground).not.toBe(darkColors.toastSuccessBackground);

    await render(<Toast message="Nope" onDismiss={jest.fn()} variant="error" />);

    expect(StyleSheet.flatten(screen.getByTestId("toast").props.style).backgroundColor).toBe(
      lightColors.toastErrorBackground,
    );
  });
});
