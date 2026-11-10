import { CHIP_HEIGHT, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

/** Company and fit, role, details, then status: the same lines as ApplicationRow. */
export default function ApplicationSkeletonRow() {
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
      testID="application-skeleton-row"
    >
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Skeleton height={20} style={{ flex: 1 }} width="auto" />
        <Skeleton height={16} width="15%" />
      </View>
      <Skeleton height={16} width="70%" />
      <Skeleton height={16} width="55%" />
      <Skeleton height={CHIP_HEIGHT} testID="application-skeleton-chip" width="30%" />
    </View>
  );
}
