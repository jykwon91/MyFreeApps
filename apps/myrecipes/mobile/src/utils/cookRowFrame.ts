import type { Theme } from "@platform/mobile";
import type { ViewStyle } from "react-native";

/** The box around one cook in the cook log, shared by a loaded row and its loading placeholder. */
export function cookRowFrame({ colors, spacing, radius }: Theme): ViewStyle {
  return {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    borderColor: colors.border,
    backgroundColor: colors.card,
  };
}
