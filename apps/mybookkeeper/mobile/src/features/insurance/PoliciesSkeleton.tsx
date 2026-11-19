import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { INSURANCE_MESSAGES, POLICY_SKELETON_ROWS } from "../../constants/insurance";

export function PolicySkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Skeleton height={20} width="65%" />
      <Skeleton height={14} width="50%" />
    </View>
  );
}

export default function PoliciesSkeleton() {
  return (
    <LoadingRegion label={INSURANCE_MESSAGES.loadingList} testID="policies-skeleton">
      {POLICY_SKELETON_ROWS.map((row) => (
        <PolicySkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
