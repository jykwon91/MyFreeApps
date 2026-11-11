import { LoadingButton, useAnnouncement, useTheme } from "@platform/mobile";
import { ActivityIndicator, Text, View } from "react-native";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";
import type { AnalyzeProgressProps } from "../../types/AnalyzeProgressProps";
import AnalysisSkeleton from "./AnalysisSkeleton";

/**
 * The wait while the AI scores the job, as the website's: what it's doing and how long it takes,
 * turning to "longer than usual" after a few seconds. Cancel goes back to what was entered.
 */
export default function AnalyzeProgress({ source, isLongRunning, onCancel }: AnalyzeProgressProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const heading = isLongRunning ? MESSAGES.longRunning : source === "url" ? MESSAGES.readingLink : MESSAGES.analyzingText;
  const body = isLongRunning ? MESSAGES.longWait : MESSAGES.usualWait;
  // Announced once, on both platforms; a live region as well would have Android read it twice.
  useAnnouncement(heading);
  return (
    <View style={{ gap: spacing.xl }}>
      <View
        style={{ alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}
        testID="analyze-progress"
      >
        <ActivityIndicator accessibilityLabel={heading} color={colors.mutedForeground} size="large" />
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600", textAlign: "center" }}>
          {heading}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, textAlign: "center" }}>{body}</Text>
        <LoadingButton accessibilityHint={MESSAGES.cancelHint} onPress={onCancel} style={{ alignSelf: "stretch" }} variant="secondary">
          {MESSAGES.cancel}
        </LoadingButton>
      </View>
      <AnalysisSkeleton />
    </View>
  );
}
