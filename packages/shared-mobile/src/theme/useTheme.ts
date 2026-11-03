import { useColorScheme } from "react-native";
import type { Theme } from "../types/Theme";
import { darkColors, lightColors } from "./colors";
import { radius } from "./radius";
import { spacing } from "./spacing";
import { fontSize } from "./typography";

export function useTheme(): Theme {
  const isDark = useColorScheme() === "dark";
  return {
    isDark,
    colors: isDark ? darkColors : lightColors,
    spacing,
    radius,
    fontSize,
  };
}
