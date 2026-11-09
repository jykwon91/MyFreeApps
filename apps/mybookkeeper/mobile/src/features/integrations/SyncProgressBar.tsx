import { progressPercent } from "@mybookkeeper/api-client/utils/progressPercent";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function SyncProgressBar({ done, total }: { done: number; total: number }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: done }}
        style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}
      >
        <View style={{ height: 6, width: `${progressPercent(done, total)}%`, backgroundColor: colors.primary }} />
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>
        {done} / {total}
      </Text>
    </View>
  );
}
