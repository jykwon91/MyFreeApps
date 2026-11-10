import type { NativeStackNavigationOptions } from "expo-router";
import { useMemo } from "react";
import { useTheme } from "../theme/useTheme";

// Header and scene colours for a native Stack, from the same tokens the tab bar uses, so a
// pushed screen follows the system light/dark scheme instead of the native light default.
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      headerStyle: { backgroundColor: colors.card },
      headerTintColor: colors.foreground,
      headerTitleStyle: { color: colors.foreground },
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors],
  );
}
