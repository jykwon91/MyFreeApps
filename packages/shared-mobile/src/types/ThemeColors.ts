export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  /** Outline of an interactive control (field, picker, outline button, selected segment): 3:1 on background, card and muted. `border` and `input` are decorative edges. */
  inputBorder: string;
  destructive: string;
  destructiveForeground: string;
  /** For text and borders on `background` or `card`. `destructive` is a button fill. */
  destructiveText: string;
  /** For money coming in, on `background` or `card`. Never the only sign of it. */
  positiveText: string;
  /** Chart series for money in and out. Differ in lightness (3:1 apart) and from `background` (3:1), so they read without hue. */
  chartPositive: string;
  chartNegative: string;
  toastSuccessBackground: string;
  toastSuccessBorder: string;
  toastSuccessForeground: string;
  toastErrorBackground: string;
  toastErrorBorder: string;
  toastErrorForeground: string;
  /** For information to know about rather than act on, in the same weights as success and error. */
  toastInfoBackground: string;
  toastInfoBorder: string;
  toastInfoForeground: string;
}
