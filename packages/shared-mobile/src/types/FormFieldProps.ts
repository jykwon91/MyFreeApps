import type { ComponentRef, ReactNode, Ref } from "react";
import type { StyleProp, TextInput, TextInputProps, ViewStyle } from "react-native";

export interface FormFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  /** Replaces `hint`. Screen readers announce it when it appears or changes, on iOS and Android. */
  error?: string;
  hint?: string;
  /**
   * How much of a length limit is used, for example "5,100 / 5,000". Shown next to the field, drawn
   * as an error when `error` is set, and hidden from screen readers: it changes with every keystroke,
   * so only the (unchanging) `error` is announced.
   */
  counter?: string;
  required?: boolean;
  /** Sits at the end of the input, e.g. a button that shows a password. */
  trailing?: ReactNode;
  ref?: Ref<ComponentRef<typeof TextInput>>;
  style?: StyleProp<ViewStyle>;
  /** For the box you type in, where `style` is for the whole field. */
  inputStyle?: TextInputProps["style"];
}
