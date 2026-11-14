import { useSyncExternalStore } from "react";
import { chooseThemePreference, getThemePreference, subscribeThemePreference } from "../theme/themePreferenceStore";
import type { ThemePreferenceState } from "../types/ThemePreferenceState";

/** The theme chosen on this phone: light, dark, or following the phone's setting. */
export function useThemePreference(): ThemePreferenceState {
  const preference = useSyncExternalStore(subscribeThemePreference, getThemePreference);
  return { preference, setPreference: chooseThemePreference };
}
