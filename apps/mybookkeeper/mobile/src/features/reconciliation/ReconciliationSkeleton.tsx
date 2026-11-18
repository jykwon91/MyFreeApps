import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RECONCILIATION_MESSAGES as MESSAGES, RECONCILIATION_SKELETON_ROWS } from "../../constants/reconciliation";

export default function ReconciliationSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={MESSAGES.loading} testID="reconciliation-skeleton">
      {RECONCILIATION_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="70%" />
          <Skeleton height={24} width="40%" />
          <Skeleton height={14} width="55%" />
          <Skeleton height={24} width="30%" />
        </View>
      ))}
    </LoadingRegion>
  );
}
