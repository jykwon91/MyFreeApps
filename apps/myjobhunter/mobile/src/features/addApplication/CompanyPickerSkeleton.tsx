import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { ADD_APPLICATION_MESSAGES as MESSAGES, COMPANY_PICKER_SKELETON_ROWS } from "../../constants/addApplication";

/** Name and website lines, the same shape as CompanyPickerRow, while the companies load. */
export default function CompanyPickerSkeleton() {
  const { colors, spacing } = useTheme();
  return (
    <View accessibilityLabel={MESSAGES.loadingCompanies} accessible testID="company-picker-skeleton">
      {COMPANY_PICKER_SKELETON_ROWS.map((key) => (
        <View
          key={key}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: "center",
            gap: spacing.xs,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
          testID="company-picker-skeleton-row"
        >
          <Skeleton height={18} width="55%" />
          <Skeleton height={12} width="35%" />
        </View>
      ))}
    </View>
  );
}
