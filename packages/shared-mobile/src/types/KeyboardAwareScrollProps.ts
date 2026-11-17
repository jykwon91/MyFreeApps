import type { Ref } from "react";
import type { KeyboardAwareScrollViewProps } from "react-native-keyboard-controller";
import type { KeyboardAwareScrollRef } from "./KeyboardAwareScrollRef";

export type KeyboardAwareScrollProps = KeyboardAwareScrollViewProps & {
  ref?: Ref<KeyboardAwareScrollRef>;
  /**
   * Whether Android's content is padded to clear the navigation bar (default true). Turn it off when a bar below the
   * scroll view already pads for it. A scroll view inside the tab navigator never needs it: the tab bar does.
   */
  padForNavigationBar?: boolean;
};
