import { useHeaderHeight } from "expo-router/react-navigation";
import { KeyboardAvoidingView, Platform } from "react-native";
import type { HeaderKeyboardAvoidingViewProps } from "../types/HeaderKeyboardAvoidingViewProps";

/**
 * Lifts a bottom-pinned bar (a send or save button, a toolbar) above the keyboard on a screen under a stack header.
 *
 * KeyboardAvoidingView pads by comparing its position in its parent with the keyboard's position on the screen,
 * and the header sits between the two, so it needs the header's height as an offset. A screen that only scrolls
 * should use `automaticallyAdjustKeyboardInsets` on its scroll view instead, which needs no offset.
 */
export default function HeaderKeyboardAvoidingView({ children }: HeaderKeyboardAvoidingViewProps) {
  const headerHeight = useHeaderHeight();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={headerHeight} style={{ flex: 1 }}>
      {children}
    </KeyboardAvoidingView>
  );
}
