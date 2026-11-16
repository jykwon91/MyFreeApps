import { Dimensions } from "react-native";

/** The text size a phone starts at. React Native's test setup pretends it is twice that. */
export const DEFAULT_FONT_SCALE = 1;

/** Sets the phone's text size, as a multiple of the default, the way the system reports a change to it. */
export function setFontScale(fontScale: number): void {
  Dimensions.set({
    window: { ...Dimensions.get("window"), fontScale },
    screen: { ...Dimensions.get("screen"), fontScale },
  });
}
