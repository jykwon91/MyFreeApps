import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export interface RentalRoiDetailStatProps {
  label: string;
  value: string;
}

export default function RentalRoiDetailStat({ label, value }: RentalRoiDetailStatProps) {
  const { colors, fontSize } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: "40%" }}>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: colors.foreground }}>{value}</Text>
    </View>
  );
}
