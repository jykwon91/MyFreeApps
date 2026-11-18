import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { TAX_REPORT_MESSAGES as MESSAGES, TAX_REPORT_SKELETON_ROWS } from "../../constants/taxReport";

export default function TaxReportSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={MESSAGES.loading} style={{ gap: spacing.md, paddingHorizontal: spacing.lg }} testID="tax-report-skeleton">
      <Skeleton height={96} width="100%" />
      <Skeleton height={44} width="100%" />
      {TAX_REPORT_SKELETON_ROWS.map((row) => (
        <Skeleton height={44} key={row} width="100%" />
      ))}
    </LoadingRegion>
  );
}
