import type { ComponentRef, Ref } from "react";
import type { StyleProp, TextInput, TextInputProps, ViewStyle } from "react-native";

export interface FormFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  /** Replaces `hint`. Screen readers announce it when it appears or changes, on iOS and Android. */
  error?: string;
  hint?: string;
  required?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
  style?: StyleProp<ViewStyle>;
}
