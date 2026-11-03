import type { ComponentRef, Ref } from "react";
import type { StyleProp, TextInput, TextInputProps, ViewStyle } from "react-native";

export interface FormFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  /** Replaces `hint` and is announced by screen readers when it appears. */
  error?: string;
  hint?: string;
  required?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
  style?: StyleProp<ViewStyle>;
}
