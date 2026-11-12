import { render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { Text } from "react-native";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";
import { KEYBOARD_FIELD_CLEARANCE } from "../constants/keyboard";
import type { KeyboardAwareScrollRef } from "../types/KeyboardAwareScrollRef";

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
});
