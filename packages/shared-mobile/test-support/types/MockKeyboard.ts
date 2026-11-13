import type { KeyboardHandler } from "react-native-keyboard-controller";
import type { SharedValue } from "react-native-reanimated";

/** The keyboard under Jest: where the provider says it is, and the handlers mounted components have registered. */
export type MockKeyboard = {
  height: SharedValue<number>;
  progress: SharedValue<number>;
  handlers: Set<KeyboardHandler>;
};
