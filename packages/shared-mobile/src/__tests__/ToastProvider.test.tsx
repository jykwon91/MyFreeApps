import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text } from "react-native";
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

  it("sits above the keyboard while it's up, and back above the tab bar after", async () => {
    const handlers: Record<string, (event: { endCoordinates: { height: number } }) => void> = {};
    jest.spyOn(Keyboard, "addListener").mockImplementation(((name: string, handler: (typeof handlers)[string]) => {
      handlers[name] = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    await render(
      <ToastProvider bottomOffset={80}>
        <Sender />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByText("Send"));
    // The message is the alert; the box placing it holds it.
    const bottom = () => StyleSheet.flatten(screen.getByRole("alert").parent?.props.style).bottom;
    expect(bottom()).toBe(80);
    await act(async () => handlers.keyboardDidShow({ endCoordinates: { height: 300 } }));
    expect(bottom()).toBe(300 + spacing.md);
    await act(async () => handlers.keyboardDidHide({ endCoordinates: { height: 0 } }));
    expect(bottom()).toBe(80);
  });

  it("fails loudly without a provider", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(render(<Sender />)).rejects.toThrow("needs a ToastProvider");
  });
});
