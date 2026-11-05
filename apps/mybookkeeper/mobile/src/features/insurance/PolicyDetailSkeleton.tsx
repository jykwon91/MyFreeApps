import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { INSURANCE_MESSAGES } from "../../constants/insurance";

export default function PolicyDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={INSURANCE_MESSAGES.loadingOne}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, padding: spacing.lg }}
      testID="policy-detail-skeleton"
    >
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="50%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={80} />
    </View>
  );
}
