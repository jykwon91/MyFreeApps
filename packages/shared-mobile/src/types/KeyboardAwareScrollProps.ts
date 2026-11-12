import type { Ref } from "react";
import type { KeyboardAwareScrollViewProps } from "react-native-keyboard-controller";
import type { KeyboardAwareScrollRef } from "./KeyboardAwareScrollRef";

export type KeyboardAwareScrollProps = KeyboardAwareScrollViewProps & {
  ref?: Ref<KeyboardAwareScrollRef>;
};
