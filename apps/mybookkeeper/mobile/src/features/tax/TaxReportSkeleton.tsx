import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { TAX_REPORT_MESSAGES as MESSAGES, TAX_REPORT_SKELETON_ROWS } from "../../constants/taxReport";

export default function TaxReportSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={MESSAGES.loading}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
      testID="tax-report-skeleton"
    >
      <Skeleton height={96} width="100%" />
      <Skeleton height={44} width="100%" />
      {TAX_REPORT_SKELETON_ROWS.map((row) => (
        <Skeleton height={44} key={row} width="100%" />
      ))}
    </View>
  );
}
