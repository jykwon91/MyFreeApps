import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import type { CatalogCardProps } from "../../types/CatalogCardProps";

/** One choice in a list: a language to learn, or a scenario to practice. */
export default function CatalogCard({ title, detail, prefix, onPress }: CatalogCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={[prefix, title, detail].filter(Boolean).join(" ")}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.lg,
        borderWidth: 1,
        borderRadius: radius.md,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.card,
      })}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
          {prefix ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs, fontWeight: "500" }}>{prefix}</Text> : null}
          <Text style={{ flexShrink: 1, color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>{title}</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{detail}</Text>
      </View>
      <Text importantForAccessibility="no" style={{ color: colors.mutedForeground, fontSize: fontSize.lg }}>
        ›
      </Text>
    </Pressable>
  );
}
