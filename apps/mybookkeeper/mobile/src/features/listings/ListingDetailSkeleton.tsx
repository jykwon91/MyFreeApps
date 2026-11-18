import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { LISTING_MESSAGES } from "../../constants/listings";

export default function ListingDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={LISTING_MESSAGES.loadingOne} style={{ gap: spacing.md, padding: spacing.lg }} testID="listing-detail-skeleton">
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="30%" />
      <Skeleton height={44} />
      <Skeleton height={120} />
      <Skeleton height={160} />
    </LoadingRegion>
  );
}
