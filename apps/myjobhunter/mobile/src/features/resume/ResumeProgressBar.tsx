import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { ResumeProgressBarProps } from "../../types/ResumeProgressBarProps";

/** How far through the suggestions the session is, read out as a count. */
export default function ResumeProgressBar({ completed, total, accessibilityLabel }: ResumeProgressBarProps) {
  const { colors, radius } = useTheme();
  const share = total > 0 ? Math.min(completed / total, 1) : 0;
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: completed }}
      style={{ height: 6, borderRadius: radius.full, backgroundColor: colors.muted, overflow: "hidden" }}
    >
      <View style={{ width: `${share * 100}%`, height: "100%", backgroundColor: colors.primary }} />
    </View>
  );
}
