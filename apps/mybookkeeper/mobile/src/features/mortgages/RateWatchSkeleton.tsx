import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { MORTGAGE_RATE_MESSAGES, RATE_SKELETON_CARDS } from "../../constants/mortgageRates";

/** Mirrors the loaded section: a verdict, then a card per loan. */
export default function RateWatchSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={MORTGAGE_RATE_MESSAGES.loadingLabel} style={{ gap: spacing.lg }} testID="rate-watch-skeleton">
      <Skeleton height={72} />
      <Skeleton height={14} width="70%" />
      {RATE_SKELETON_CARDS.map((card) => (
        <View key={card} style={{ gap: spacing.sm }}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={16} />
          <Skeleton height={16} />
          <Skeleton height={16} />
        </View>
      ))}
    </LoadingRegion>
  );
}
