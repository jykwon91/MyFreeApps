import { useTheme } from "@platform/mobile";
import { View } from "react-native";

export default function UtilityCostBar({ percent }: { percent: number }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ height: 6, borderRadius: radius.sm, backgroundColor: colors.muted, overflow: "hidden" }}>
      <View style={{ height: 6, width: `${percent}%`, backgroundColor: colors.primary }} />
    </View>
  );
}
