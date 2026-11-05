import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { NEW_LEASE_MESSAGES, NEW_LEASE_SKELETON_FIELDS } from "../../constants/newLease";

export default function NewLeaseDetailsSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={NEW_LEASE_MESSAGES.loadingDetails} accessibilityRole="progressbar" style={{ gap: spacing.lg, padding: spacing.lg }} testID="new-lease-skeleton">
      <View style={{ gap: spacing.xs }}>
        <Skeleton height={28} width="70%" />
        <Skeleton height={14} width="50%" />
      </View>
      {NEW_LEASE_SKELETON_FIELDS.map((field) => (
        <View key={field} style={{ gap: spacing.xs }}>
          <Skeleton height={14} width="35%" />
          <Skeleton height={44} width="100%" />
        </View>
      ))}
    </View>
  );
}
