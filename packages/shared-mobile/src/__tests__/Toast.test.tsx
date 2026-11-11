import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";
import Toast from "../components/Toast";
import { darkColors, lightColors } from "../theme/colors";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

const DISMISS = { name: "Dismiss notification" };

describe("Toast", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("announces the message to screen readers, once per message", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    const { rerender } = await render(
      <Toast message="Saved" onDismiss={jest.fn()} variant="success" />,
    );

    expect(screen.getByRole("alert", { name: "Saved" })).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith("Saved");

    await rerender(<Toast message="Saved" onDismiss={jest.fn()} variant="success" />);
    expect(announce).toHaveBeenCalledTimes(1);

    await rerender(<Toast message="Sent" onDismiss={jest.fn()} variant="success" />);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith("Sent");
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

  it("doesn't dismiss again when the timer runs out after a press", async () => {
    const schedule = jest.spyOn(globalThis, "setTimeout");
    const cancel = jest.spyOn(globalThis, "clearTimeout");
    const onDismiss = jest.fn();
    await render(<Toast durationMs={1000} message="Saved" onDismiss={onDismiss} variant="success" />);
    const countdown = schedule.mock.results[schedule.mock.calls.findIndex((call) => call[1] === 1000)];

    await fireEvent.press(screen.getByRole("button", DISMISS));
    expect(cancel).toHaveBeenCalledWith(countdown.value);
    await act(async () => jest.advanceTimersByTime(2000));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("doesn't dismiss twice on two presses", async () => {
    const onDismiss = jest.fn();
    await render(<Toast message="Saved" onDismiss={onDismiss} variant="success" />);
    const button = screen.getByRole("button", DISMISS);

    await act(async () => {
      button.props.onClick();
      button.props.onClick();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("can dismiss again after a press when the message changes", async () => {
    const onDismiss = jest.fn();
    const { rerender } = await render(
      <Toast durationMs={1000} message="One" onDismiss={onDismiss} variant="success" />,
    );

    await fireEvent.press(screen.getByRole("button", DISMISS));
    await rerender(<Toast durationMs={1000} message="Two" onDismiss={onDismiss} variant="success" />);
    await act(async () => jest.advanceTimersByTime(1000));

    expect(onDismiss).toHaveBeenCalledTimes(2);
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
  it("has no action button unless given one", async () => {
    await render(<Toast message="Saved" onDismiss={jest.fn()} variant="success" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("runs its action and dismisses, with a touch target of at least the minimum", async () => {
    const onDismiss = jest.fn();
    const onPress = jest.fn();
    await render(
      <Toast action={{ label: "Undo", onPress, accessibilityHint: "Puts it back" }} message="Dismissed." onDismiss={onDismiss} variant="success" />,
    );
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo.props.accessibilityHint).toBe("Puts it back");
    const style = StyleSheet.flatten(undo.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(style.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

    await fireEvent.press(undo);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    await act(async () => jest.advanceTimersByTime(10000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
