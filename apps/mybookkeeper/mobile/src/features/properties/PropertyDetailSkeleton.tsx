import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { PROPERTY_MESSAGES } from "../../constants/properties";

export default function PropertyDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={PROPERTY_MESSAGES.loadingOne} style={{ gap: spacing.md, padding: spacing.lg }} testID="property-detail-skeleton">
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="50%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
    </LoadingRegion>
  );
}
