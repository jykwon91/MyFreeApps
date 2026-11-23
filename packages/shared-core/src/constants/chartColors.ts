/**
 * Chart series colours for money in and out, shared by web and mobile.
 * Each pair differs in lightness (3:1), not just hue, so red-green colour blindness
 * can't make the two series look the same. Each colour is also 3:1 against the card.
 */
export const CHART_COLORS = {
  light: { positive: "#16a34a", negative: "#7f1d1d" },
  dark: { positive: "#86efac", negative: "#b91c1c" },
} as const;
