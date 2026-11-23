import { describe, expect, it } from "vitest";
import { CHART_COLORS } from "../constants/chartColors";

const CARD = { light: "#ffffff", dark: "#020817" } as const; // hsl(222.2 84% 4.9%)
const MIN_RATIO = 3;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(["light", "dark"] as const)("chart colours in %s mode", (mode) => {
  const { positive, negative } = CHART_COLORS[mode];

  it.each([["positive", positive], ["negative", negative]])("%s is 3:1 against the card", (_name, colour) => {
    expect(contrast(colour, CARD[mode])).toBeGreaterThanOrEqual(MIN_RATIO);
  });

  it("revenue and expenses differ by 3:1 without hue", () => {
    expect(contrast(positive, negative)).toBeGreaterThanOrEqual(MIN_RATIO);
  });
});
