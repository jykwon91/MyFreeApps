import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { SummaryRowProps } from "../../types/SummaryRowProps";

/** A label and its value on one line, as the website's interview summary lays them out. */
export default function SummaryRow({ label, children }: SummaryRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <Text style={{ minWidth: 80, fontSize: fontSize.sm, fontWeight: "500", color: colors.foreground }}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
