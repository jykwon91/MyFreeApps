import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";

export default function MortgageDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={MORTGAGE_MESSAGES.loadingOne} style={{ gap: spacing.md, padding: spacing.lg }} testID="mortgage-detail-skeleton">
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="50%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
    </LoadingRegion>
  );
}
