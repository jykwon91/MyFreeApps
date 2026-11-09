import { Pressable, Text } from "react-native";
import { OPTION_SHEET_ROW_HEIGHT } from "../constants/optionSheet";
import { useTheme } from "../theme/useTheme";
import type { OptionRowProps } from "../types/OptionRowProps";

export default function OptionRow({ label, isSelected, onPress, kind = "radio" }: OptionRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={kind}
      accessibilityState={{ checked: isSelected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: OPTION_SHEET_ROW_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text style={{ flex: 1, fontSize: fontSize.md, fontWeight: isSelected ? "600" : "400", color: colors.foreground }}>
        {label}
      </Text>
      {isSelected ? <Text style={{ fontSize: fontSize.md, color: colors.primary }}>✓</Text> : null}
    </Pressable>
  );
}
