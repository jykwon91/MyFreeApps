import { useWindowDimensions } from "react-native";
import { LARGE_TEXT_FONT_SCALE } from "../constants/largeText";

/**
 * Whether the phone's text size is large enough that rows should stack and wrap instead of cutting text short.
 * Only changes when the text size or the screen's size does, so a list doesn't redraw its rows as it scrolls.
 */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= LARGE_TEXT_FONT_SCALE;
}
