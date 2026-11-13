import { act, render, screen } from "@testing-library/react-native";
import type { NativeEvent } from "react-native-keyboard-controller";
import { StyleSheet, Text } from "react-native";
import PinnedBar from "../components/PinnedBar";
import { mockKeyboard, moveMockKeyboard } from "../../test-support/mockKeyboard";
import type { KeyboardHandlerEvent } from "../../test-support/types/KeyboardHandlerEvent";

const HOME_INDICATOR = 34;
const SPACING = 12;
const KEYBOARD = 300;

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));

function bar() {
  return (
    <PinnedBar bottomSpacing={SPACING} style={{ borderTopWidth: 1 }}>
      <Text>Send</Text>
    </PinnedBar>
  );
}

function keyboardAt(progress: number): NativeEvent {
  return { progress, height: KEYBOARD * progress, duration: 250, target: 1 };
}

// Reanimated restyles the view without rendering; its Jest mock computes the style when the bar renders, so each
// read renders the bar again, from a new element so React doesn't skip it.
async function padding() {
  await screen.rerender(bar());
  const style = StyleSheet.flatten(screen.getByText("Send").parent!.props.style);
  expect(style.borderTopWidth).toBe(1);
  return style.paddingBottom;
}

async function move(event: KeyboardHandlerEvent, progress: number) {
  await act(() => moveMockKeyboard(event, keyboardAt(progress)));
}

describe("PinnedBar", () => {
  // Padded for the home indicator while the keyboard was up, the bar floated that far above the keyboard, which
  // covers that strip. Switched all at once, it jumped; it follows the keyboard's every frame instead, on iOS too,
  // where the provider's own progress only jumps to where the keyboard is headed.
  it("pads for the home indicator with the keyboard closed and shrinks it frame by frame as the keyboard opens", async () => {
    await render(bar());
    expect(await padding()).toBe(SPACING + HOME_INDICATOR);

    await move("onMove", 0.5);
    expect(await padding()).toBe(SPACING + HOME_INDICATOR / 2);

    await move("onEnd", 1);
    expect(await padding()).toBe(SPACING);
  });

  it("follows the keyboard as it's dragged shut", async () => {
    await render(bar());
    await move("onEnd", 1);

    await move("onInteractive", 0.5);
    expect(await padding()).toBe(SPACING + HOME_INDICATOR / 2);
  });

  it("starts from where the keyboard is when it mounts, then follows the keyboard alone", async () => {
    mockKeyboard.progress.value = 1;
    await render(bar());
    expect(await padding()).toBe(SPACING);

    await move("onMove", 0.5);
    expect(await padding()).toBe(SPACING + HOME_INDICATOR / 2);
  });
});
