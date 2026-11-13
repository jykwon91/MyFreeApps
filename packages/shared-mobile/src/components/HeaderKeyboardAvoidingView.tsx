import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import type { HeaderKeyboardAvoidingViewProps } from "../types/HeaderKeyboardAvoidingViewProps";

/**
 * Lifts a bottom-pinned bar (a send or save button, a toolbar) above the keyboard on a screen under a stack header,
 * on iOS and Android. Android draws edge to edge, so its window no longer shrinks for the keyboard and the bar
 * needs the same padding iOS gets.
 *
 * The view pads by how far its bottom edge sits below the keyboard's top. automaticOffset measures where the view
 * really is in the window, so the header above it, whatever its height, and a status bar drawn over are counted
 * without an offset. A screen that only scrolls should use KeyboardAwareScroll instead.
 */
export default function HeaderKeyboardAvoidingView({ children }: HeaderKeyboardAvoidingViewProps) {
  return (
    <KeyboardAvoidingView automaticOffset behavior="padding" style={{ flex: 1 }}>
      {children}
    </KeyboardAvoidingView>
  );
}
