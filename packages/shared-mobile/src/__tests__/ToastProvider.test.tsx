import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { type IKeyboardState, useKeyboardState } from "react-native-keyboard-controller";
import ToastProvider from "../components/ToastProvider";
import { useToast } from "../hooks/useToast";
import { spacing } from "../theme/spacing";

function Sender() {
  const { showToast } = useToast();
  return (
    <Pressable onPress={() => showToast("Deleted.")}>
      <Text>Send</Text>
    </Pressable>
  );
}

function ScreenThatLeaves() {
  const [isOpen, setIsOpen] = useState(true);
  return isOpen ? <Sender /> : <Pressable onPress={() => setIsOpen(true)} />;
}

describe("ToastProvider", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("keeps showing a message after the screen that sent it is gone", async () => {
    const { rerender } = await render(
      <ToastProvider bottomOffset={80}>
        <ScreenThatLeaves />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByText("Send"));

    await rerender(
      <ToastProvider bottomOffset={80}>
        <Text>Another screen</Text>
      </ToastProvider>,
    );

    expect(screen.getByRole("alert", { name: "Deleted." })).toBeTruthy();
  });

  it("starts its timer again when the same thing is said twice", async () => {
    await render(
      <ToastProvider bottomOffset={80}>
        <Sender />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByText("Send"));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await fireEvent.press(screen.getByText("Send"));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("alert", { name: "Deleted." })).toBeTruthy();
  });

  it("goes away by itself", async () => {
    await render(
      <ToastProvider bottomOffset={80}>
        <Sender />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByText("Send"));
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // The keyboard controller measures from the bottom of the screen, nav bar included, which is where the toast is
  // placed from: Android draws edge to edge, and React Native's own keyboard height left the nav bar out.
  it("sits above the keyboard while it's up, and back above the tab bar after", async () => {
    let keyboard: IKeyboardState = { height: 0, isVisible: false, duration: 0, timestamp: 0, target: -1, type: "default", appearance: "light" };
    const mockedState = jest.mocked(useKeyboardState);
    const libraryMock = mockedState.getMockImplementation();
    mockedState.mockImplementation(((select: (state: IKeyboardState) => unknown) => select(keyboard)) as typeof useKeyboardState);
    // A new element each time, so a rerender reads the keyboard again.
    const toaster = () => (
      <ToastProvider bottomOffset={80}>
        <Sender />
      </ToastProvider>
    );
    try {
      const tree = await render(toaster());
      await fireEvent.press(screen.getByText("Send"));
      // The message is the alert; the box placing it holds it.
      const bottom = () => StyleSheet.flatten(screen.getByRole("alert").parent?.props.style).bottom;
      expect(bottom()).toBe(80);

      keyboard = { ...keyboard, height: 336, isVisible: true };
      await act(async () => tree.rerender(toaster()));
      expect(bottom()).toBe(336 + spacing.md);

      // A hidden keyboard can keep its last height; only a visible one moves the toast.
      keyboard = { ...keyboard, isVisible: false };
      await act(async () => tree.rerender(toaster()));
      expect(bottom()).toBe(80);
    } finally {
      mockedState.mockImplementation(libraryMock);
    }
  });

  it("fails loudly without a provider", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(render(<Sender />)).rejects.toThrow("needs a ToastProvider");
  });
  it("shows an action with the message, and drops it with the next toast", async () => {
    const onUndo = jest.fn();
    function ActionSender() {
      const { showToast } = useToast();
      return (
        <>
          <Pressable onPress={() => showToast("Dismissed.", "success", { label: "Undo", onPress: onUndo })}>
            <Text>Dismiss it</Text>
          </Pressable>
          <Pressable onPress={() => showToast("Saved")}>
            <Text>Save it</Text>
          </Pressable>
        </>
      );
    }
    await render(
      <ToastProvider bottomOffset={0}>
        <ActionSender />
      </ToastProvider>,
    );

    await fireEvent.press(screen.getByText("Dismiss it"));
    await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert", { name: "Dismissed." })).toBeNull();

    await fireEvent.press(screen.getByText("Dismiss it"));
    await fireEvent.press(screen.getByText("Save it"));
    expect(screen.getByRole("alert", { name: "Saved" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});
