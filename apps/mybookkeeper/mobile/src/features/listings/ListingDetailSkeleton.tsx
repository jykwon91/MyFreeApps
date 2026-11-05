import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { LISTING_MESSAGES } from "../../constants/listings";

export default function ListingDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={LISTING_MESSAGES.loadingOne}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, padding: spacing.lg }}
      testID="listing-detail-skeleton"
    >
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="30%" />
      <Skeleton height={44} />
      <Skeleton height={120} />
      <Skeleton height={160} />
    </View>
  );
}
