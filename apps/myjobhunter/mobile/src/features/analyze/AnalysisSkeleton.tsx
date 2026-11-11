import { DIMENSION_KEY_ORDER } from "@myjobhunter/api-client/constants/jobAnalysisDimensionKeys";
import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { ANALYSIS_SKELETON_BUTTONS, ANALYSIS_SKELETON_HEIGHTS as HEIGHTS } from "../../constants/analysisSkeleton";
import AnalysisSkeletonFlags from "./AnalysisSkeletonFlags";

/**
 * Where the result will be, in its shape: the caption, the role, the verdict, one card per rubric
 * dimension, the red and green flags, then the decision row.
 */
export default function AnalysisSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ gap: spacing.lg }} testID="analysis-skeleton">
      <Skeleton height={HEIGHTS.caption} testID="skeleton-analysis-caption" width="50%" />
      <View style={{ gap: spacing.xs }} testID="skeleton-analysis-header">
        <Skeleton height={HEIGHTS.title} width="70%" />
        <Skeleton height={HEIGHTS.line} width="45%" />
        <Skeleton height={HEIGHTS.link} width="60%" />
      </View>
      <Skeleton borderRadius={radius.md} height={HEIGHTS.verdict} testID="skeleton-analysis-verdict" width="100%" />
      <View style={{ gap: spacing.md }}>
        <Skeleton height={HEIGHTS.sectionHeading} width="35%" />
        {DIMENSION_KEY_ORDER.map((key) => (
          <View key={key} style={{ gap: spacing.sm, padding: spacing.md }} testID="skeleton-analysis-dimension">
            <Skeleton height={HEIGHTS.dimensionName} width="40%" />
            <Skeleton height={HEIGHTS.line} width="90%" />
          </View>
        ))}
      </View>
      <AnalysisSkeletonFlags />
      <View style={{ gap: spacing.md }} testID="skeleton-analysis-actions">
        <Skeleton height={HEIGHTS.line} width="85%" />
        {ANALYSIS_SKELETON_BUTTONS.map((key) => (
          <Skeleton borderRadius={radius.md} height={HEIGHTS.button} key={key} testID="skeleton-analysis-button" width="100%" />
        ))}
      </View>
    </View>
  );
}
