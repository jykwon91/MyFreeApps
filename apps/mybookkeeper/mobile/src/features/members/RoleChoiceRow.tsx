import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";

interface RoleChoiceRowProps {
  label: string;
  description: string;
  isSelected: boolean;
  onPress: () => void;
}

export default function RoleChoiceRow({ label, description, isSelected, onPress }: RoleChoiceRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.md, fontWeight: isSelected ? "600" : "400", color: colors.foreground }}>{label}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{description}</Text>
      </View>
      {isSelected ? <Text style={{ fontSize: fontSize.md, color: colors.primary }}>✓</Text> : null}
    </Pressable>
  );
}
