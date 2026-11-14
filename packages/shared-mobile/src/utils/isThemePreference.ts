import { THEME_PREFERENCE } from "../constants/themePreference";
import type { ThemePreference } from "../types/ThemePreference";

const VALUES: readonly string[] = Object.values(THEME_PREFERENCE);

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && VALUES.includes(value);
}
