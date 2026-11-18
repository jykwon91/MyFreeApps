import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { VENDOR_MESSAGES } from "../../constants/vendors";

export default function VendorDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={VENDOR_MESSAGES.loadingOne} style={{ gap: spacing.md, padding: spacing.lg }} testID="vendor-detail-skeleton">
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="30%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={80} />
    </LoadingRegion>
  );
}
