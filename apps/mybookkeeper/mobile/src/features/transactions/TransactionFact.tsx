import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function TransactionFact({ label, value }: { label: string; value: string }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View accessible style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{value}</Text>
    </View>
  );
}
