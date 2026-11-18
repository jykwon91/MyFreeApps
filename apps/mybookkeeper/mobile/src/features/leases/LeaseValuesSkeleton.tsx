import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { LEASE_DETAIL_MESSAGES } from "../../constants/leaseDetails";

const ROWS = ["a", "b", "c", "d", "e", "f"];

export default function LeaseValuesSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={LEASE_DETAIL_MESSAGES.loadingDetails} style={{ gap: spacing.lg, padding: spacing.lg }} testID="lease-values-skeleton">
      {ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs }}>
          <Skeleton height={14} width="30%" />
          <Skeleton height={20} width="65%" />
        </View>
      ))}
    </LoadingRegion>
  );
}
