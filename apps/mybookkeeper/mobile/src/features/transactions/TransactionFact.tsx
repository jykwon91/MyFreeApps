import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function TransactionFact({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View accessible style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{label}</Text>
      <Text selectable={selectable} style={{ fontSize: fontSize.md, color: colors.foreground }}>{value}</Text>
    </View>
  );
}
