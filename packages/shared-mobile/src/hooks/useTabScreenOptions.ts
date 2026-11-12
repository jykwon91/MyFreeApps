import { useMemo } from "react";
import { useTheme } from "../theme/useTheme";
import type { TabScreenOptions } from "../types/TabScreenOptions";
import type { TabScreenOptionsSettings } from "../types/TabScreenOptionsSettings";

// Header, tab bar and scene colours for a Tabs navigator, from the same tokens as
// useStackScreenOptions, so the tab bar follows the system light/dark scheme.
export function useTabScreenOptions({ showIcons = false }: TabScreenOptionsSettings = {}): TabScreenOptions {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      headerStyle: { backgroundColor: colors.card },
      headerTintColor: colors.foreground,
      tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.mutedForeground,
      ...(showIcons ? {} : { tabBarIconStyle: { display: "none" as const } }),
      sceneStyle: { backgroundColor: colors.background },
    }),
    [colors, showIcons],
  );
}
