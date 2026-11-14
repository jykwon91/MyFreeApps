/** What the theme can be set to on the phone, the same three the website's theme toggle offers. */
export const THEME_PREFERENCE = {
  light: "light",
  dark: "dark",
  system: "system",
} as const;

/** Until a choice is made, the phone's own light/dark setting decides, as on the website. */
export const DEFAULT_THEME_PREFERENCE = THEME_PREFERENCE.system;

export const THEME_PREFERENCE_KEY = "platform.theme";

/** In the website's order and words. */
export const THEME_OPTIONS = [
  { value: THEME_PREFERENCE.light, label: "Light" },
  { value: THEME_PREFERENCE.dark, label: "Dark" },
  { value: THEME_PREFERENCE.system, label: "System" },
] as const;

export const THEME_MESSAGES = {
  heading: "Theme",
} as const;

/**
 * The override handed to React Native's Appearance, so what the system draws for the app (the status bar's
 * "auto" style, alerts, the keyboard, pickers) follows the choice too. "auto" removes the override.
 */
export const APPEARANCE_OVERRIDE = {
  light: "light",
  dark: "dark",
  system: "auto",
} as const;
