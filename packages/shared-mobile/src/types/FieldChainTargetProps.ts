import type { ComponentRef, RefCallback } from "react";
import type { TextInput } from "react-native";

/** What a field the chain only moves into spreads, such as a multiline one, whose Return types a new line. */
export interface FieldChainTargetProps {
  ref: RefCallback<ComponentRef<typeof TextInput>>;
}
