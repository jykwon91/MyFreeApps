import { View } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { ProgressBarProps } from "../types/ProgressBarProps";

/** A thin determinate bar that a screen reader treats as one labelled progress bar with a spoken value. */
export default function ProgressBar({ completed, total, accessibilityLabel, valueText }: ProgressBarProps) {
  const { colors, radius } = useTheme();
  const share = total > 0 ? Math.min(completed / total, 1) : 0;
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: completed, text: valueText }}
      style={{ height: 6, borderRadius: radius.full, backgroundColor: colors.muted, overflow: "hidden" }}
    >
      <View style={{ width: `${share * 100}%`, height: "100%", backgroundColor: colors.primary }} />
    </View>
  );
}
