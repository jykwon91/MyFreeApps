import { useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";

interface ListingSummaryRowProps {
  label: string;
  value: string;
  onPress: () => void;
}

/** A glance at a part of the listing; tapping it opens that part on its own screen. */
export default function ListingSummaryRow({ label, value, onPress }: ListingSummaryRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
        borderWidth: 1,
        borderRadius: radius.md,
        borderColor: colors.input,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{label}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{value}</Text>
      </View>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: fontSize.lg, color: colors.mutedForeground }}>
        ›
      </Text>
    </Pressable>
  );
}
