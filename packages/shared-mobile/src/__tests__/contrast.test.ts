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

// What each token is for. A Record, so a new token won't compile until it is given a role.
// - text: drawn as text on any text surface.
// - surface: a background that text tokens sit on (`muted` is also the pressed-row fill).
// - fill / label: a solid fill and the one token drawn on it, paired in FILL_LABELS.
// - outline: borders and dividers, never text.
// - chart: bar fills for chart series, checked for 3:1 against the surface and against each other.
const TOKEN_ROLES: Record<Token, "text" | "surface" | "fill" | "label" | "outline" | "chart"> = {
  background: "surface",
  card: "surface",
  muted: "surface",
  secondary: "surface",
  foreground: "text",
  mutedForeground: "text",
  primary: "text",
  secondaryForeground: "text",
  destructiveText: "text",
  positiveText: "text",
  chartPositive: "chart",
  chartNegative: "chart",
  primaryForeground: "label",
  destructive: "fill",
  destructiveForeground: "label",
  border: "outline",
  input: "outline",
  inputBorder: "outline",
  toastSuccessBackground: "fill",
  toastSuccessBorder: "outline",
  toastSuccessForeground: "label",
  toastErrorBackground: "fill",
  toastErrorBorder: "outline",
  toastErrorForeground: "label",
  toastInfoBackground: "fill",
  toastInfoBorder: "outline",
  toastInfoForeground: "label",
};

const tokensWithRole = (role: string) =>
  (Object.keys(TOKEN_ROLES) as Token[]).filter((token) => TOKEN_ROLES[token] === role);

// Every text token on every text surface.
const TEXT_PAIRS: [Token, Token][] = tokensWithRole("text").flatMap((text) =>
  tokensWithRole("surface").map((surface): [Token, Token] => [text, surface]),
);

// `primary` is a text token and also the primary button fill.
const FILL_LABELS: [Token, Token][] = [
  ["primaryForeground", "primary"],
  ["destructiveForeground", "destructive"],
  ["toastSuccessForeground", "toastSuccessBackground"],
  ["toastErrorForeground", "toastErrorBackground"],
  ["toastInfoForeground", "toastInfoBackground"],
];

describe("token roles", () => {
  it("pairs every label with a fill", () => {
    expect(FILL_LABELS.map(([label]) => label).sort()).toEqual(tokensWithRole("label").sort());
    expect(tokensWithRole("fill").every((fill) => FILL_LABELS.some(([, f]) => f === fill))).toBe(true);
  });
});

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
    it.each([...TEXT_PAIRS, ...FILL_LABELS])("%s on %s meets AA for text", (foreground, surface) => {
      expect(contrastRatio(colors[foreground], colors[surface])).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it.each(["background", "card", "muted"] as const)(
      "the control outline (inputBorder) meets 3:1 non-text contrast on %s",
      (surface) => {
        expect(contrastRatio(colors.inputBorder, colors[surface])).toBeGreaterThanOrEqual(AA_NON_TEXT);
      },
    );

    it("the selected segment's outline stands out from the muted track it sits on", () => {
      // SegmentedControl: a `card` segment outlined in `inputBorder` on a `muted` track.
      expect(contrastRatio(colors.inputBorder, colors.muted)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });

    it.each(["background", "card"] as const)("each chart series is 3:1 against %s", (surface) => {
      expect(contrastRatio(colors.chartPositive, colors[surface])).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(contrastRatio(colors.chartNegative, colors[surface])).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });

    it("the money in and money out chart series differ by 3:1 without hue", () => {
      expect(contrastRatio(colors.chartPositive, colors.chartNegative)).toBeGreaterThanOrEqual(AA_NON_TEXT);
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
