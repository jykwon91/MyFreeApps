import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";

export default function MortgageDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={MORTGAGE_MESSAGES.loadingOne}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, padding: spacing.lg }}
      testID="mortgage-detail-skeleton"
    >
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="50%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
    </View>
  );
}
