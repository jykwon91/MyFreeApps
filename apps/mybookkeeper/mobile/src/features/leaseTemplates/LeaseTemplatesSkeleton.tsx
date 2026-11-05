import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { LEASE_TEMPLATE_MESSAGES, LEASE_TEMPLATE_SKELETON_ROWS } from "../../constants/leaseTemplates";

export default function LeaseTemplatesSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={LEASE_TEMPLATE_MESSAGES.loadingList} accessibilityRole="progressbar" testID="lease-templates-skeleton">
      {LEASE_TEMPLATE_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="65%" />
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="45%" />
        </View>
      ))}
    </View>
  );
}
