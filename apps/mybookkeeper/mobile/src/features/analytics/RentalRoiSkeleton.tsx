import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES, RENTAL_ROI_SKELETON_CARDS } from "../../constants/rentalRoi";

export default function RentalRoiSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={MESSAGES.loading} style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg }} testID="rental-roi-skeleton">
      {/* Headline */}
      <Skeleton height={28} width="75%" />
      <Skeleton height={14} width="55%" />

      {/* Cards */}
      {RENTAL_ROI_SKELETON_CARDS.map((i) => (
        <View
          key={i}
          style={{ gap: spacing.sm, padding: spacing.md, borderRadius: 8 }}
          testID="rental-roi-skeleton-card"
        >
          <Skeleton height={14} width="50%" />
          <Skeleton height={28} width="40%" />
          <Skeleton height={14} width="100%" />
        </View>
      ))}
    </LoadingRegion>
  );
}
