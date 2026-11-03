import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import type { ButtonVariant } from "./ButtonVariant";

export interface LoadingButtonProps
  extends Omit<PressableProps, "children" | "disabled" | "onPress" | "style"> {
  children: string;
  /**
   * Return a promise to have the button show its own loading state from the moment
   * it's pressed until the promise settles. A rejection is not swallowed: handle
   * errors in `onPress` (and show a Toast) or it surfaces as an unhandled rejection.
   */
  onPress: () => void | Promise<void>;
  /** For work the caller tracks itself, e.g. `mutation.isPending`. */
  isLoading?: boolean;
  /** Replaces the label while loading. */
  loadingText?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}
