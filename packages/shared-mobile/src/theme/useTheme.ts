import { useColorScheme } from "react-native";
import { useThemePreference } from "../hooks/useThemePreference";
import type { Theme } from "../types/Theme";
import { resolveIsDark } from "../utils/resolveIsDark";
import { darkColors, lightColors } from "./colors";
import { radius } from "./radius";
import { spacing } from "./spacing";
import { fontSize } from "./typography";

export function useTheme(): Theme {
  const { preference } = useThemePreference();
  const isDark = resolveIsDark(preference, useColorScheme());
  return {
    isDark,
    colors: isDark ? darkColors : lightColors,
    spacing,
    radius,
    fontSize,
  };
}
