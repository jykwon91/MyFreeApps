import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { TAX_RETURNS_SKELETON_ROWS } from "../../constants/taxReturns";

export default function TaxReturnsSkeleton({ label, testID }: { label: string; testID: string }) {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={label} style={{ gap: spacing.md, paddingHorizontal: spacing.lg }} testID={testID}>
      {TAX_RETURNS_SKELETON_ROWS.map((row) => (
        <Skeleton height={64} key={row} width="100%" />
      ))}
    </LoadingRegion>
  );
}
