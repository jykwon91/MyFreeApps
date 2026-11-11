import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

/** Name, domain, then industry and HQ: the same lines as CompanyRow. */
export default function CompanySkeletonRow() {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
      testID="company-skeleton-row"
    >
      <Skeleton height={20} width="50%" />
      <Skeleton height={16} width="35%" />
      <Skeleton height={16} width="60%" />
    </View>
  );
}
