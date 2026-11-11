import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";
import type { AnalysisActionsProps } from "../../types/AnalysisActionsProps";

/**
 * The website's decision row: add it to applications, or analyze another. Once added, it says so
 * and offers to view the applications instead.
 */
export default function AnalysisActions({ appliedApplicationId, isApplying, onApply, onAnalyzeAnother, onViewApplications }: AnalysisActionsProps) {
  const { colors, spacing, fontSize } = useTheme();
  if (appliedApplicationId) {
    return (
      <View style={{ gap: spacing.md }}>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.saved}</Text>
        <LoadingButton onPress={onAnalyzeAnother}>{MESSAGES.analyzeAnother}</LoadingButton>
        <LoadingButton onPress={onViewApplications} variant="secondary">
          {MESSAGES.viewApplications}
        </LoadingButton>
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.bridge}</Text>
      <LoadingButton isLoading={isApplying} loadingText={MESSAGES.adding} onPress={onApply}>
        {MESSAGES.addToApplications}
      </LoadingButton>
      <LoadingButton disabled={isApplying} onPress={onAnalyzeAnother} variant="secondary">
        {MESSAGES.analyzeAnother}
      </LoadingButton>
    </View>
  );
}
