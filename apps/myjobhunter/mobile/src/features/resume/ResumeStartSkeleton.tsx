import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RESUME_START_SKELETON_ROWS } from "../../constants/resumeSkeleton";

/** The start panel's shape while the uploads load: its line of guidance, the resume rows, the Start button, and the upload button with its hint. */
export default function ResumeStartSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: spacing.md }} testID="resume-start-skeleton">
      <Skeleton height={14} width="90%" />
      <View style={{ gap: spacing.sm }}>
        {Array.from({ length: RESUME_START_SKELETON_ROWS }, (_, index) => (
          <Skeleton borderRadius={radius.md} height={64} key={index} testID="skeleton-resume-job" />
        ))}
      </View>
      <Skeleton borderRadius={radius.md} height={44} />
      <View style={{ alignItems: "center", gap: spacing.xs }}>
        <Skeleton borderRadius={radius.md} height={44} width="100%" />
        <Skeleton height={12} width="60%" />
      </View>
    </View>
  );
}
