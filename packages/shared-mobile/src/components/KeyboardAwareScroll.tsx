import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { KEYBOARD_FIELD_CLEARANCE } from "../constants/keyboard";
import type { KeyboardAwareScrollProps } from "../types/KeyboardAwareScrollProps";

/**
 * A scroll view that keeps the focused field above the keyboard, on iOS and Android, in a screen or in a sheet.
 *
 * It pads its content by the keyboard's height and scrolls by where the field is on the screen, so a header above
 * it or a page sheet around it needs no offset. Android draws edge to edge, so its window no longer shrinks for
 * the keyboard and nothing else would move the field. Needs the RootProviders around the app.
 */
export default function KeyboardAwareScroll({ bottomOffset = KEYBOARD_FIELD_CLEARANCE, ...props }: KeyboardAwareScrollProps) {
  return <KeyboardAwareScrollView bottomOffset={bottomOffset} {...props} />;
}
