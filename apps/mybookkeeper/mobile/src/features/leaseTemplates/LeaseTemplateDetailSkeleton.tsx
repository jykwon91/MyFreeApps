import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { LEASE_TEMPLATE_MESSAGES } from "../../constants/leaseTemplates";

export default function LeaseTemplateDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={LEASE_TEMPLATE_MESSAGES.loadingOne}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, padding: spacing.lg }}
      testID="lease-template-detail-skeleton"
    >
      <Skeleton height={28} width="70%" />
      <Skeleton height={16} width="25%" />
      <Skeleton height={40} />
      <Skeleton height={20} width="20%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={20} width="35%" />
      <Skeleton height={40} />
    </View>
  );
}
