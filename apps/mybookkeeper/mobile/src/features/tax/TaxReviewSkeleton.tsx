import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { TAX_REVIEW_MESSAGES as MESSAGES, TAX_REVIEW_SKELETON_ROWS } from "../../constants/taxReview";

export default function TaxReviewSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={MESSAGES.loading}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
      testID="tax-review-skeleton"
    >
      <Skeleton height={20} width="40%" />
      <Skeleton height={44} width="100%" />
      {TAX_REVIEW_SKELETON_ROWS.map((row) => (
        <Skeleton height={64} key={row} width="100%" />
      ))}
    </View>
  );
}
