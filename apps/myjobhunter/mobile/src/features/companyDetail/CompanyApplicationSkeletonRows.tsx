import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { COMPANY_APPLICATION_SKELETON_ROWS } from "../../constants/companyApplications";

/** Rows the shape of CompanyApplicationRow: a role, then where, how remote and when. */
export default function CompanyApplicationSkeletonRows() {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {COMPANY_APPLICATION_SKELETON_ROWS.map((row) => (
        <View
          key={row}
          style={{ gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}
          testID="company-application-skeleton-row"
        >
          <Skeleton height={20} width="60%" />
          <Skeleton height={16} width="45%" />
        </View>
      ))}
    </View>
  );
}
