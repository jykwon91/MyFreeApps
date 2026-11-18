import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { INSURANCE_MESSAGES } from "../../constants/insurance";

export default function PolicyDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={INSURANCE_MESSAGES.loadingOne} style={{ gap: spacing.md, padding: spacing.lg }} testID="policy-detail-skeleton">
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="50%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={80} />
    </LoadingRegion>
  );
}
