import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import type { WorkspaceActionRowProps } from "../../types/WorkspaceActionRowProps";

/** A row on More that does something to the workspace, sized and read out like the menu's own rows. */
export default function WorkspaceActionRow({ label, secondary, hint, onPress }: WorkspaceActionRowProps) {
  const { colors, fontSize, spacing } = useTheme();
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={secondary ? `${label}, ${secondary}` : label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: "center",
        paddingVertical: spacing.xs,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ color: colors.foreground, fontSize: fontSize.md }}>{label}</Text>
      {secondary ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{secondary}</Text> : null}
    </Pressable>
  );
}
