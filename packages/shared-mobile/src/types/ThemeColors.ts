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
  destructive: string;
  destructiveForeground: string;
  /** For text and borders on `background` or `card`. `destructive` is a button fill. */
  destructiveText: string;
  /** For money coming in, on `background` or `card`. Never the only sign of it. */
  positiveText: string;
  toastSuccessBackground: string;
  toastSuccessBorder: string;
  toastSuccessForeground: string;
  toastErrorBackground: string;
  toastErrorBorder: string;
  toastErrorForeground: string;
}
