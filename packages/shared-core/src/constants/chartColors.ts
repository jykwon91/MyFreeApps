/**
 * Chart series colours for money in and out, shared by web and mobile.
 * Each pair differs in lightness (3:1), not just hue, so red-green colour blindness
 * can't make the two series look the same. Each colour is also 3:1 against the card.
 * `loans` is the part of money out that paid a mortgage or a loan. It is stacked on
 * `negative`, so it is also 3:1 against `negative`.
 */
export const CHART_COLORS = {
  light: { positive: "#16a34a", negative: "#7f1d1d", loans: "#d97706" },
  dark: { positive: "#86efac", negative: "#b91c1c", loans: "#fbbf24" },
} as const;
