import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { PAYMENT_REVIEW_MESSAGES, PAYMENT_REVIEW_SKELETON_ROWS } from "../../constants/paymentReview";

export default function PaymentReviewSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={PAYMENT_REVIEW_MESSAGES.loading} accessibilityRole="progressbar" testID="payment-review-skeleton">
      <View style={{ padding: spacing.lg }}>
        <Skeleton height={20} width="50%" />
      </View>
      {PAYMENT_REVIEW_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="70%" />
          <Skeleton height={14} width="40%" />
          <Skeleton height={20} width="55%" />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </View>
      ))}
    </View>
  );
}
