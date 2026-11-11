import type { ChipTone } from "../types/ChipTone";
import type { ToneColor } from "../types/ToneColor";

type ColoredTone = Exclude<ChipTone, "neutral">;

// The web's badge shades (Tailwind 100 on 700, and 900 on 300 in dark). Neutral isn't here:
// it is the theme's own muted and foreground. __tests__/contrast.test.ts holds every pair to AA.
export const lightToneColors: Record<ColoredTone, ToneColor> = {
  info: { background: "#dbeafe", foreground: "#1d4ed8" },
  accent: { background: "#f3e8ff", foreground: "#7e22ce" },
  success: { background: "#dcfce7", foreground: "#15803d" },
  warning: { background: "#fef9c3", foreground: "#a16207" },
  danger: { background: "#fee2e2", foreground: "#b91c1c" },
};

export const darkToneColors: Record<ColoredTone, ToneColor> = {
  info: { background: "#1e3a8a", foreground: "#93c5fd" },
  accent: { background: "#581c87", foreground: "#d8b4fe" },
  success: { background: "#14532d", foreground: "#86efac" },
  warning: { background: "#713f12", foreground: "#fde047" },
  danger: { background: "#7f1d1d", foreground: "#fca5a5" },
};
