import { TextInput, type TextInputProps } from "react-native";

// Jest's React Native mock gives every TextInput the same focus mock, called with the input as `this`.
const focus = jest.mocked(TextInput.prototype.focus);

/** The accessibility label of the field last given the cursor with `focus()`, if any since `forgetFocusedFields`. */
export function lastFocusedField(): string | undefined {
  const input = focus.mock.contexts.at(-1) as { props: TextInputProps } | undefined;
  return input?.props.accessibilityLabel;
}

export function forgetFocusedFields(): void {
  focus.mockClear();
}
