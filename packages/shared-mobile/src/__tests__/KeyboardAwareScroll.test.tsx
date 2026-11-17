import { render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";
import { KEYBOARD_FIELD_CLEARANCE } from "../constants/keyboard";
import type { KeyboardAwareScrollRef } from "../types/KeyboardAwareScrollRef";

const mockInsets = { current: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => mockInsets.current }));

// Under Jest the keyboard controller's scroll view is the library's mock: a ScrollView given the props.
describe("KeyboardAwareScroll", () => {
  it("keeps room under the focused field for its hint, and passes the scroll view's props on", async () => {
    await render(
      <KeyboardAwareScroll contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" testID="form">
        <Text>Amount</Text>
      </KeyboardAwareScroll>,
    );
    const scroll = screen.getByTestId("form");
    expect(scroll.props.bottomOffset).toBe(KEYBOARD_FIELD_CLEARANCE);
    expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe("automatic");
    expect(screen.getByText("Amount")).toBeTruthy();
  });

  it("lets a screen ask for a different clearance", async () => {
    await render(<KeyboardAwareScroll bottomOffset={0} testID="form" />);
    expect(screen.getByTestId("form").props.bottomOffset).toBe(0);
  });

  // FormSheet and others scroll back to the top to show a failure.
  it("hands its ref to the scroll view, so a screen can scroll it", async () => {
    const ref = createRef<KeyboardAwareScrollRef>();
    await render(<KeyboardAwareScroll ref={ref} />);
    expect(typeof ref.current?.scrollTo).toBe("function");
  });

  it("keeps a tap on a button working while the keyboard is open, unless a screen says otherwise", async () => {
    await render(<KeyboardAwareScroll testID="form" />);
    expect(screen.getByTestId("form").props.keyboardShouldPersistTaps).toBe("handled");
  });

  describe("navigation bar inset", () => {
    afterEach(() => {
      jest.restoreAllMocks();
      mockInsets.current = { top: 0, left: 0, right: 0, bottom: 0 };
    });

    const contentPadding = () => StyleSheet.flatten(screen.getByTestId("form").props.contentContainerStyle);

    async function renderScroll(): Promise<void> {
      mockInsets.current = { top: 0, left: 0, right: 0, bottom: 48 };
      await render(<KeyboardAwareScroll contentContainerStyle={{ padding: 16 }} testID="form" />);
    }

    it("pads Android's content below the last control by the navigation bar", async () => {
      jest.replaceProperty(Platform, "OS", "android");
      await renderScroll();
      expect(contentPadding()).toMatchObject({ padding: 16, paddingBottom: 64 });
    });

    it("leaves iOS alone, which insets its content itself", async () => {
      jest.replaceProperty(Platform, "OS", "ios");
      await renderScroll();
      expect(contentPadding()).toEqual({ padding: 16 });
    });
  });
});
