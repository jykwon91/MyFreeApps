import type { ThemePreference } from "./ThemePreference";

export interface ThemePreferenceState {
  preference: ThemePreference;
  /** Takes effect at once across the app and is kept on the phone for next time. */
  setPreference: (preference: ThemePreference) => void;
}
