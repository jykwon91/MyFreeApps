import { CHIP_HEIGHT, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { ANALYSIS_SKELETON_FLAG_LISTS, ANALYSIS_SKELETON_FLAGS, ANALYSIS_SKELETON_HEIGHTS as HEIGHTS } from "../../constants/analysisSkeleton";

/** The red and green flag lists while the analysis runs: each one's chip, then a line per flag. */
export default function AnalysisSkeletonFlags() {
  const { spacing, radius } = useTheme();
  return (
    <>
      {ANALYSIS_SKELETON_FLAG_LISTS.map((list) => (
        <View key={list} style={{ gap: spacing.sm }} testID="skeleton-analysis-flags">
          <Skeleton borderRadius={radius.md} height={CHIP_HEIGHT} width="25%" />
          {ANALYSIS_SKELETON_FLAGS.map((flag) => (
            <Skeleton height={HEIGHTS.line} key={flag} width="75%" />
          ))}
        </View>
      ))}
    </>
  );
}
