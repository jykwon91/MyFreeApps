import type { ChipTone } from "../types/ChipTone";
import type { ToneColor } from "../types/ToneColor";
import { darkToneColors, lightToneColors } from "./toneColors";
import { useTheme } from "./useTheme";

/**
 * A tone's background and foreground in the current theme, as a Chip paints it, for anything else
 * toned the same way. Null for neutral, which is the theme's own muted and foreground.
 */
export function useToneColor(tone: ChipTone): ToneColor | null {
  const { isDark } = useTheme();
  return tone === "neutral" ? null : (isDark ? darkToneColors : lightToneColors)[tone];
}
