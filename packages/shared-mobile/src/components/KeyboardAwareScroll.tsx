import { BottomTabBarHeightContext } from "expo-router/js-tabs";
import { useContext } from "react";
import { Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KEYBOARD_FIELD_CLEARANCE } from "../constants/keyboard";
import type { KeyboardAwareScrollProps } from "../types/KeyboardAwareScrollProps";
import { withBottomInset } from "../utils/withBottomInset";

/**
 * A scroll view that keeps the focused field above the keyboard, on iOS and Android, in a screen or in a sheet.
 *
 * It pads its content by the keyboard's height and scrolls by where the field is on the screen, so a header above
 * it or a page sheet around it needs no offset. Android draws edge to edge, so its window no longer shrinks for
 * the keyboard and nothing else would move the field, and its scroll content isn't padded for the navigation bar
 * either (contentInsetAdjustmentBehavior is iOS only), so the last control would sit behind it; this pads for both.
 * Inside the tab navigator, or with padForNavigationBar off for a bar below that pads for it, it skips that padding.
 * It sets keyboardShouldPersistTaps to "handled" so the first tap on a button isn't spent closing the keyboard.
 * Needs the RootProviders around the app.
 */
export default function KeyboardAwareScroll({
  bottomOffset = KEYBOARD_FIELD_CLEARANCE,
  contentContainerStyle,
  keyboardShouldPersistTaps = "handled",
  padForNavigationBar = true,
  ...props
}: KeyboardAwareScrollProps) {
  const { bottom: navigationBar } = useSafeAreaInsets();
  // Undefined outside the tab navigator; inside it, the tab bar already sits above the navigation bar.
  const isInTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const inset = Platform.OS === "android" && padForNavigationBar && !isInTabs ? navigationBar : 0;
  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      contentContainerStyle={withBottomInset(contentContainerStyle, inset)}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    />
  );
}
