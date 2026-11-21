import { useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { KEYBOARD_FIELD_CLEARANCE } from "../constants/keyboard";
import type { ScrollWithPinnedBarProps } from "../types/ScrollWithPinnedBarProps";
import KeyboardAwareScroll from "./KeyboardAwareScroll";

/**
 * A scrolling form with a bar pinned below it (a save or send button): the bar rides on top of the keyboard and the
 * focused field is scrolled into view above the bar.
 *
 * This is the keyboard controller's pattern for a scroll view with a footer. The scroll view fills the screen and the
 * bar sits in a KeyboardStickyView below it, which moves up by the keyboard's height. The scroll view pads its content
 * by the keyboard's height, which is exactly how much of it the keyboard and the lifted bar together cover, so it needs
 * no extra space; but it scrolls a field to just above the keyboard, which is under the bar, so the field's clearance
 * (bottomOffset) is widened by the bar's height.
 *
 * The bar is a PinnedBar, which drops its padding for the home indicator as the keyboard opens, so it already ends
 * at the keyboard's top and needs no sticky offset, and it pads for the navigation bar itself, so the scroll content
 * doesn't. Not inside HeaderKeyboardAvoidingView: that would account for the keyboard a second time.
 */
export default function ScrollWithPinnedBar({
  bar,
  bottomOffset = KEYBOARD_FIELD_CLEARANCE,
  ...scrollProps
}: ScrollWithPinnedBarProps) {
  const [barHeight, setBarHeight] = useState(0);
  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScroll
        {...scrollProps}
        bottomOffset={bottomOffset + barHeight}
        padForNavigationBar={false}
      />
      <KeyboardStickyView onLayout={(event: LayoutChangeEvent) => setBarHeight(event.nativeEvent.layout.height)}>{bar}</KeyboardStickyView>
    </View>
  );
}
