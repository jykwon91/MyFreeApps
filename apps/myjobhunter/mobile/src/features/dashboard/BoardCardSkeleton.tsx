import { CHIP_HEIGHT, MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { COMPANY_LOGO_SIZE } from "../../constants/dashboard";
import { DASHBOARD_SKELETON_HEIGHTS as HEIGHTS } from "../../constants/dashboardSkeleton";

/** Logo, role, company and a chip, then the Move button: the same shape as BoardCard. */
export default function BoardCardSkeleton() {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
      }}
      testID="board-card-skeleton"
    >
      <Skeleton borderRadius={radius.full} height={COMPANY_LOGO_SIZE} width={COMPANY_LOGO_SIZE} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Skeleton height={HEIGHTS.cardRole} width="80%" />
        <Skeleton height={HEIGHTS.cardCompany} width="50%" />
        <Skeleton height={CHIP_HEIGHT} width="35%" />
      </View>
      <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} width={MIN_TOUCH_TARGET + spacing.lg * 2} />
    </View>
  );
}
