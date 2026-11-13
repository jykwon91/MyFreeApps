import type { THEME_PREFERENCE } from "../constants/themePreference";

export type ThemePreference = (typeof THEME_PREFERENCE)[keyof typeof THEME_PREFERENCE];
