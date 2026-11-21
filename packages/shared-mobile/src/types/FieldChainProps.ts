import type { ComponentRef, RefCallback } from "react";
import type { ReturnKeyTypeOptions, TextInput, TextInputProps } from "react-native";

/** What a text field spreads to take its place in a `useFieldChain` chain. */
export interface FieldChainProps {
  ref: RefCallback<ComponentRef<typeof TextInput>>;
  returnKeyType: ReturnKeyTypeOptions;
  submitBehavior: NonNullable<TextInputProps["submitBehavior"]>;
  onSubmitEditing: (() => void) | undefined;
}
