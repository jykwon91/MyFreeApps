import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { REVIEW_MESSAGES, REVIEW_QUEUE_SKELETON_ROWS } from "../../constants/calendarReview";

export default function ReviewQueueSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={REVIEW_MESSAGES.loading} accessibilityRole="progressbar" testID="review-queue-skeleton">
      {REVIEW_QUEUE_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={14} width="25%" />
          <Skeleton height={20} width="70%" />
          <Skeleton height={14} width="50%" />
          <Skeleton height={44} width="100%" />
        </View>
      ))}
    </View>
  );
}
