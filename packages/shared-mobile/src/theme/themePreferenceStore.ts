import { Appearance } from "react-native";
import { APPEARANCE_OVERRIDE, DEFAULT_THEME_PREFERENCE } from "../constants/themePreference";
import type { ThemePreference } from "../types/ThemePreference";
import { readThemePreference, writeThemePreference } from "../utils/themePreferenceStorage";

// One preference for the whole app, so every screen reading useTheme changes together.
let current: ThemePreference = DEFAULT_THEME_PREFERENCE;
let choicesMade = 0;
const listeners = new Set<() => void>();

function apply(preference: ThemePreference): void {
  if (preference === current) return;
  current = preference;
  Appearance.setColorScheme(APPEARANCE_OVERRIDE[preference]);
  listeners.forEach((listener) => listener());
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getThemePreference(): ThemePreference {
  return current;
}

export function chooseThemePreference(preference: ThemePreference): void {
  choicesMade += 1;
  apply(preference);
  void writeThemePreference(preference);
}

/** Puts back the theme chosen before. A choice made while it was being read wins. */
export async function restoreThemePreference(): Promise<void> {
  const choicesBefore = choicesMade;
  const stored = await readThemePreference();
  if (choicesMade === choicesBefore) apply(stored);
}
