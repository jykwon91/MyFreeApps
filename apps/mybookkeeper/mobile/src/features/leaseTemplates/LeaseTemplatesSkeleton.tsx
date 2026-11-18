import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { LEASE_TEMPLATE_MESSAGES, LEASE_TEMPLATE_SKELETON_ROWS } from "../../constants/leaseTemplates";

export function LeaseTemplateSkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Skeleton height={20} width="65%" />
      <Skeleton height={14} width="80%" />
      <Skeleton height={14} width="45%" />
    </View>
  );
}

export default function LeaseTemplatesSkeleton() {
  return (
    <LoadingRegion label={LEASE_TEMPLATE_MESSAGES.loadingList} testID="lease-templates-skeleton">
      {LEASE_TEMPLATE_SKELETON_ROWS.map((row) => (
        <LeaseTemplateSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
