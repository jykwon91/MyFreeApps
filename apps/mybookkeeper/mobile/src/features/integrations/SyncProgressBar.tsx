import { ProgressBar, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";

/** How far the sync is through its emails: one labelled progress bar, with the visible count kept out of the reading order. */
export default function SyncProgressBar({ done, total }: { done: number; total: number }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <ProgressBar accessibilityLabel={MESSAGES.syncProgress} completed={done} total={total} valueText={MESSAGES.syncProgressValue(done, total)} />
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>
        {done} / {total}
      </Text>
    </View>
  );
}
