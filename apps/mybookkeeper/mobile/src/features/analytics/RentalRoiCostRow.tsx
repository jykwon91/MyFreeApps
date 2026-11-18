import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export interface RentalRoiCostRowProps {
  label: string;
  value: string;
  isSubtotal?: boolean;
}

export default function RentalRoiCostRow({ label, value, isSubtotal = false }: RentalRoiCostRowProps) {
  const { colors, fontSize, spacing } = useTheme();
  const fontWeight = isSubtotal ? "600" : "400";
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
      <Text style={{ flexShrink: 1, fontSize: fontSize.sm, fontWeight, color: colors.foreground }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, fontWeight, fontVariant: ["tabular-nums"], color: colors.foreground }}>{value}</Text>
    </View>
  );
}
