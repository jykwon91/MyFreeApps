import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { MORTGAGE_MESSAGES, MORTGAGE_SKELETON_ROWS } from "../../constants/mortgages";

export function MortgageSkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} width="45%" />
      <Skeleton height={14} width="55%" />
    </View>
  );
}

export default function MortgagesSkeleton() {
  return (
    <LoadingRegion label={MORTGAGE_MESSAGES.loadingList} testID="mortgages-skeleton">
      {MORTGAGE_SKELETON_ROWS.map((row) => (
        <MortgageSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
