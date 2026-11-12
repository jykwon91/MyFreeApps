import { processColor } from "react-native";
import { darkColors, lightColors } from "../theme/colors";
import { darkToneColors, lightToneColors } from "../theme/toneColors";
import type { ThemeColors } from "../types/ThemeColors";

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

function relativeLuminance(color: string): number {
  // processColor gives 0xAARRGGBB. Going through it checks what the app will actually draw.
  const argb = processColor(color);
  if (typeof argb !== "number") throw new Error(`Not a color: ${color}`);
  const [red, green, blue] = [16, 8, 0].map((shift) => {
    const channel = ((argb >>> shift) & 0xff) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

type Token = keyof ThemeColors;

// Every foreground and the surface the components draw it on.
const TEXT_PAIRS: [Token, Token][] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["mutedForeground", "background"],
  ["mutedForeground", "card"],
  ["primaryForeground", "primary"],
  ["destructiveForeground", "destructive"],
  ["destructiveText", "background"],
  ["destructiveText", "card"],
  ["positiveText", "background"],
  ["positiveText", "card"],
  ["toastSuccessForeground", "toastSuccessBackground"],
  ["toastErrorForeground", "toastErrorBackground"],
  ["toastInfoForeground", "toastInfoBackground"],
];

describe("contrastRatio", () => {
  it("matches known values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // WCAG's own borderline grey on white.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    // The web's error red on white, which is why destructiveText exists.
    expect(contrastRatio("hsl(0, 84.2%, 60.2%)", "#ffffff")).toBeCloseTo(3.76, 2);
  });
});

describe.each(Object.entries({ light: lightColors, dark: darkColors }))(
  "%s theme contrast",
  (_scheme, colors) => {
    it.each(TEXT_PAIRS)("%s on %s meets AA for text", (foreground, surface) => {
      expect(contrastRatio(colors[foreground], colors[surface])).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it("the error border stands out from the background", () => {
      expect(contrastRatio(colors.destructiveText, colors.background)).toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      );
    });
  },
);

describe.each(Object.entries({ light: lightToneColors, dark: darkToneColors }))(
  "%s chip tone contrast",
  (_scheme, tones) => {
    it.each(Object.entries(tones))("%s text meets AA on its background", (_tone, { foreground, background }) => {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  },
);
