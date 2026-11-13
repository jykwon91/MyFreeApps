import type { ColorSchemeName } from "react-native";
import { THEME_PREFERENCE } from "../constants/themePreference";
import type { ThemePreference } from "../types/ThemePreference";

/** Whether the app is dark: a light or dark choice wins, and "system" follows the phone (light if it won't say). */
export function resolveIsDark(preference: ThemePreference, systemScheme: ColorSchemeName | null | undefined): boolean {
  if (preference === THEME_PREFERENCE.system) return systemScheme === "dark";
  return preference === THEME_PREFERENCE.dark;
}
