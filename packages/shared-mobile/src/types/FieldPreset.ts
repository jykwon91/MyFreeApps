import type { TextInputProps } from "react-native";

/** The keyboard, capitalisation, autocorrect and autofill a text field gets for what it holds. Spread onto a `FormField`. */
export type FieldPreset = Readonly<
  Pick<TextInputProps, "keyboardType" | "inputMode" | "autoCapitalize" | "autoCorrect" | "autoComplete" | "textContentType" | "spellCheck">
>;
