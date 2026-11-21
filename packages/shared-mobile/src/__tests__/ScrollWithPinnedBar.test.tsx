import { fireEvent, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import ScrollWithPinnedBar from "../components/ScrollWithPinnedBar";
import { KEYBOARD_FIELD_CLEARANCE } from "../constants/keyboard";
import type { KeyboardAwareScrollRef } from "../types/KeyboardAwareScrollRef";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 48 }) }));

const BAR_HEIGHT = 72;

// Under Jest the keyboard controller's scroll view is the library's mock: a ScrollView given the props.
describe("ScrollWithPinnedBar", () => {
  afterEach(() => jest.restoreAllMocks());

  // The keyboard controller's sticky view is a plain View under Jest, and the nearest one around the bar.
  function stickyBar() {
    let wrapper = screen.getByText("Save").parent;
    while (wrapper && !wrapper.props.onLayout) wrapper = wrapper.parent;
    return wrapper!;
  }

  async function measureBar(): Promise<void> {
    await fireEvent(stickyBar(), "layout", { nativeEvent: { layout: { height: BAR_HEIGHT } } });
  }

  async function renderForm(): Promise<void> {
    await render(
      <ScrollWithPinnedBar bar={<Text>Save</Text>} contentContainerStyle={{ padding: 16 }} testID="form">
        <Text>Amount</Text>
      </ScrollWithPinnedBar>,
    );
  }

  it("draws the form in a keyboard-aware scroll view with the bar beneath it", async () => {
    await renderForm();
    const scroll = screen.getByTestId("form");
    expect(scroll.props.bottomOffset).toBe(KEYBOARD_FIELD_CLEARANCE);
    expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
    expect(screen.getByText("Amount")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });

  // A field scrolled to just above the keyboard would sit under the lifted bar. The keyboard padding alone already
  // covers what the keyboard and bar hide, so no extra space is added (it would leave a bar-high gap).
  it("clears the focused field of the bar as well as the keyboard, without extra keyboard space", async () => {
    await renderForm();
    await measureBar();
    const scroll = screen.getByTestId("form");
    expect(scroll.props.bottomOffset).toBe(KEYBOARD_FIELD_CLEARANCE + BAR_HEIGHT);
    expect(scroll.props.extraKeyboardSpace).toBeUndefined();
  });

  // PinnedBar lets go of its home-indicator padding as the keyboard opens, so the bar already ends at the keyboard.
  it("rides the bar on the keyboard with no offset of its own", async () => {
    await renderForm();
    expect(stickyBar().props.offset).toBeUndefined();
  });

  it("adds the bar's height to a clearance a screen asks for, and passes its extra space through", async () => {
    await render(<ScrollWithPinnedBar bar={<Text>Save</Text>} bottomOffset={4} extraKeyboardSpace={6} testID="form" />);
    await measureBar();
    expect(screen.getByTestId("form").props.bottomOffset).toBe(4 + BAR_HEIGHT);
    expect(screen.getByTestId("form").props.extraKeyboardSpace).toBe(6);
  });

  // The bar pads for the navigation bar, so the scroll content padding it again would leave a gap.
  it("leaves the navigation bar to the pinned bar on Android", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await renderForm();
    expect(StyleSheet.flatten(screen.getByTestId("form").props.contentContainerStyle)).toEqual({ padding: 16 });
  });

  it("hands its ref to the scroll view, so a screen can scroll to an error", async () => {
    const ref = createRef<KeyboardAwareScrollRef>();
    await render(<ScrollWithPinnedBar bar={null} ref={ref} />);
    expect(typeof ref.current?.scrollTo).toBe("function");
  });
});
