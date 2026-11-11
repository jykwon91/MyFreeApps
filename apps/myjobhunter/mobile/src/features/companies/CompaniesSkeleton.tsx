import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { COMPANY_MESSAGES, COMPANY_SKELETON_ROWS } from "../../constants/companies";
import CompanySkeletonRow from "./CompanySkeletonRow";

/** The list header's Add and Sort buttons, then the rows, so nothing moves when the list arrives. */
export default function CompaniesSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View accessible accessibilityLabel={COMPANY_MESSAGES.loadingList} accessibilityRole="progressbar" testID="companies-skeleton">
      <View style={{ gap: spacing.md, padding: spacing.lg }} testID="companies-header-skeleton">
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
      </View>
      {COMPANY_SKELETON_ROWS.map((row) => (
        <CompanySkeletonRow key={row} />
      ))}
    </View>
  );
}
