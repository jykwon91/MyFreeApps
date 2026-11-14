import * as SecureStore from "expo-secure-store";
import { DEFAULT_THEME_PREFERENCE, THEME_PREFERENCE_KEY } from "../constants/themePreference";
import type { ThemePreference } from "../types/ThemePreference";
import { isThemePreference } from "./isThemePreference";

/** The theme chosen before. If the phone won't say, or kept something unrecognised, the phone's setting decides. */
export async function readThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await SecureStore.getItemAsync(THEME_PREFERENCE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
  } catch (error) {
    console.warn("Couldn't read the chosen theme; following the phone's setting", error);
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Keeps the choice for next time. Failing only means it isn't remembered, so it's logged rather than shown. */
export async function writeThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await SecureStore.setItemAsync(THEME_PREFERENCE_KEY, preference);
  } catch (error) {
    console.warn("Couldn't keep the chosen theme for next time", error);
  }
}
