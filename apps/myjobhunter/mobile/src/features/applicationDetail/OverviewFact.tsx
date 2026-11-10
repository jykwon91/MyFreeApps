import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { OverviewFactProps } from "../../types/OverviewFactProps";

export default function OverviewFact({ label, value }: OverviewFactProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: "500", color: colors.mutedForeground }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: fontSize.md, fontWeight: "500", color: colors.foreground }}>{value}</Text>
    </View>
  );
}
