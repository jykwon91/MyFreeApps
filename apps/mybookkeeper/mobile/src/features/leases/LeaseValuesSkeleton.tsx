import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { LEASE_DETAIL_MESSAGES } from "../../constants/leaseDetails";

const ROWS = ["a", "b", "c", "d", "e", "f"];

export default function LeaseValuesSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={LEASE_DETAIL_MESSAGES.loadingDetails} accessibilityRole="progressbar" style={{ gap: spacing.lg, padding: spacing.lg }} testID="lease-values-skeleton">
      {ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs }}>
          <Skeleton height={14} width="30%" />
          <Skeleton height={20} width="65%" />
        </View>
      ))}
    </View>
  );
}
