import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { COMPANY_DETAIL_MESSAGES as MESSAGES } from "../../constants/companyDetail";
import { COMPANY_HEADER_SKELETON_CHIPS, COMPANY_OVERVIEW_SKELETON_FACTS } from "../../constants/companyDetailSkeleton";
import CompanyApplicationSkeletonRows from "./CompanyApplicationSkeletonRows";
import ResearchSkeleton from "./ResearchSkeleton";

/** The company screen's shape while it loads: header, overview, research, applications, then Delete. */
export default function CompanyDetailSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={MESSAGES.loading}
      accessibilityRole="progressbar"
      style={{ gap: spacing.xl, padding: spacing.lg }}
      testID="company-detail-skeleton"
    >
      <View style={{ gap: spacing.xs }} testID="skeleton-company-header">
        <Skeleton height={28} width="60%" />
        <Skeleton height={MIN_TOUCH_TARGET} width="40%" />
        <View style={{ flexDirection: "row", gap: spacing.sm, paddingTop: spacing.xs }}>
          {COMPANY_HEADER_SKELETON_CHIPS.map((chip) => (
            <Skeleton borderRadius={radius.md} height={24} key={chip} width={80} />
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.md }} testID="skeleton-company-overview">
        <Skeleton height={22} width="30%" />
        {COMPANY_OVERVIEW_SKELETON_FACTS.map((fact) => (
          <View key={fact} style={{ gap: spacing.xs }} testID="skeleton-company-fact">
            <Skeleton height={12} width="20%" />
            <Skeleton height={18} width="45%" />
          </View>
        ))}
      </View>
      <View style={{ gap: spacing.md }} testID="skeleton-company-research">
        <Skeleton height={22} width="35%" />
        <ResearchSkeleton />
      </View>
      <View style={{ gap: spacing.md }} testID="skeleton-company-applications">
        <Skeleton height={22} width="55%" />
        <CompanyApplicationSkeletonRows />
      </View>
      <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
    </View>
  );
}
